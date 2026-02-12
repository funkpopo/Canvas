package handlers

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/middleware"
	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/k8s"
	"canvas/backend/internal/models"
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
	corev1 "k8s.io/api/core/v1"
	storagev1 "k8s.io/api/storage/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

type StorageHandler struct {
	Resolver *K8sResolver
	DB       *gorm.DB
}

func NewStorageHandler(resolver *K8sResolver, db *gorm.DB) *StorageHandler {
	return &StorageHandler{Resolver: resolver, DB: db}
}

func (h *StorageHandler) listAccessibleClusters(r *http.Request) ([]models.Cluster, error) {
	user, ok := middleware.CurrentUser(r)
	if !ok {
		return nil, fmt.Errorf("authentication required")
	}

	clusterIDRaw := strings.TrimSpace(r.URL.Query().Get("cluster_id"))
	if clusterIDRaw != "" {
		clusterID, err := parsePathUintParam(clusterIDRaw)
		if err != nil || clusterID == 0 {
			return nil, fmt.Errorf("invalid cluster_id")
		}
		cluster, err := h.Resolver.Service.GetClusterForUser(clusterID, user)
		if err != nil {
			return nil, err
		}
		return []models.Cluster{*cluster}, nil
	}

	query := h.DB.Model(&models.Cluster{}).Where("is_active = ?", true)
	if user.Role == "viewer" {
		allowedIDs, err := viewerAllowedClusterIDs(h.DB, user.ID)
		if err != nil {
			return nil, err
		}
		if len(allowedIDs) == 0 {
			return []models.Cluster{}, nil
		}
		query = query.Where("id IN ?", allowedIDs)
	}

	var clusters []models.Cluster
	if err := query.Order("id ASC").Find(&clusters).Error; err != nil {
		return nil, err
	}
	return clusters, nil
}

func buildClientsetForCluster(cluster *models.Cluster) (*kubernetes.Clientset, error) {
	cfg, err := k8s.BuildConfig(cluster)
	if err != nil {
		return nil, err
	}
	return k8s.NewClientset(cfg)
}

func parseQuantity(raw string) (resource.Quantity, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		trimmed = "0"
	}
	return resource.ParseQuantity(trimmed)
}

func quantityString(raw resource.Quantity) string {
	if raw.String() == "" {
		return "0"
	}
	return raw.String()
}
func (h *StorageHandler) ListStorageClasses(w http.ResponseWriter, r *http.Request) {
	clusters, err := h.listAccessibleClusters(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0)
	for i := range clusters {
		cluster := clusters[i]
		clientset, err := buildClientsetForCluster(&cluster)
		if err != nil {
			continue
		}

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		scs, err := clientset.StorageV1().StorageClasses().List(ctx, metav1.ListOptions{})
		cancel()
		if err != nil {
			continue
		}

		for _, sc := range scs.Items {
			items = append(items, map[string]interface{}{
				"name":                   sc.Name,
				"provisioner":            sc.Provisioner,
				"reclaim_policy":         sc.ReclaimPolicy,
				"volume_binding_mode":    sc.VolumeBindingMode,
				"allow_volume_expansion": sc.AllowVolumeExpansion != nil && *sc.AllowVolumeExpansion,
				"cluster_name":           cluster.Name,
				"cluster_id":             cluster.ID,
			})
		}
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i]["cluster_id"] == items[j]["cluster_id"] {
			return fmt.Sprint(items[i]["name"]) < fmt.Sprint(items[j]["name"])
		}
		return fmt.Sprint(items[i]["cluster_id"]) < fmt.Sprint(items[j]["cluster_id"])
	})
	response.Success(w, r, http.StatusOK, items)
}

type createStorageClassRequest struct {
	Name                 string            `json:"name"`
	Provisioner          string            `json:"provisioner"`
	ReclaimPolicy        *string           `json:"reclaim_policy"`
	VolumeBindingMode    *string           `json:"volume_binding_mode"`
	AllowVolumeExpansion bool              `json:"allow_volume_expansion"`
	Parameters           map[string]string `json:"parameters"`
	NFSServer            string            `json:"nfs_server"`
	NFSPath              string            `json:"nfs_path"`
	ProvisionerImage     string            `json:"provisioner_image"`
}

func (h *StorageHandler) CreateStorageClass(w http.ResponseWriter, r *http.Request) {
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	var req createStorageClassRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Provisioner = strings.TrimSpace(req.Provisioner)
	if req.Name == "" || req.Provisioner == "" {
		response.Error(w, r, http.StatusBadRequest, "name and provisioner are required")
		return
	}

	reclaimPolicy := corev1.PersistentVolumeReclaimDelete
	if req.ReclaimPolicy != nil && strings.TrimSpace(*req.ReclaimPolicy) != "" {
		reclaimPolicy = corev1.PersistentVolumeReclaimPolicy(strings.TrimSpace(*req.ReclaimPolicy))
	}
	bindingMode := storagev1.VolumeBindingImmediate
	if req.VolumeBindingMode != nil && strings.TrimSpace(*req.VolumeBindingMode) != "" {
		bindingMode = storagev1.VolumeBindingMode(strings.TrimSpace(*req.VolumeBindingMode))
	}

	params := mapStringStringClone(req.Parameters)
	if params == nil {
		params = map[string]string{}
	}
	if req.Provisioner == "kubernetes.io/nfs" || req.Provisioner == "k8s-sigs.io/nfs-subdir-external-provisioner" {
		if strings.TrimSpace(req.NFSServer) == "" || strings.TrimSpace(req.NFSPath) == "" {
			response.Error(w, r, http.StatusBadRequest, "nfs_server and nfs_path are required for NFS provisioner")
			return
		}
		if req.Provisioner == "kubernetes.io/nfs" {
			params["server"] = strings.TrimSpace(req.NFSServer)
			params["path"] = strings.TrimSpace(req.NFSPath)
		} else {
			params["nfs.server"] = strings.TrimSpace(req.NFSServer)
			params["nfs.path"] = strings.TrimSpace(req.NFSPath)
			if strings.TrimSpace(req.ProvisionerImage) != "" {
				params["image"] = strings.TrimSpace(req.ProvisionerImage)
			} else {
				params["image"] = "eipwork/nfs-subdir-external-provisioner"
			}
		}
	}

	obj := &storagev1.StorageClass{
		ObjectMeta:           metav1.ObjectMeta{Name: req.Name},
		Provisioner:          req.Provisioner,
		ReclaimPolicy:        &reclaimPolicy,
		VolumeBindingMode:    &bindingMode,
		AllowVolumeExpansion: &req.AllowVolumeExpansion,
		Parameters:           params,
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if _, err := clientset.StorageV1().StorageClasses().Create(ctx, obj, metav1.CreateOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"name":                   req.Name,
		"provisioner":            req.Provisioner,
		"reclaim_policy":         reclaimPolicy,
		"volume_binding_mode":    bindingMode,
		"allow_volume_expansion": req.AllowVolumeExpansion,
		"cluster_name":           cluster.Name,
		"cluster_id":             cluster.ID,
	})
}

func (h *StorageHandler) DeleteStorageClass(w http.ResponseWriter, r *http.Request) {
	scName := strings.TrimSpace(chi.URLParam(r, "scName"))
	if scName == "" {
		response.Error(w, r, http.StatusBadRequest, "storage class name is required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := clientset.StorageV1().StorageClasses().Delete(ctx, scName, metav1.DeleteOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"message": fmt.Sprintf("存储类 '%s' 已删除", scName),
	})
}
func (h *StorageHandler) ListPersistentVolumes(w http.ResponseWriter, r *http.Request) {
	clusters, err := h.listAccessibleClusters(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0)
	for i := range clusters {
		cluster := clusters[i]
		clientset, err := buildClientsetForCluster(&cluster)
		if err != nil {
			continue
		}
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		pvs, err := clientset.CoreV1().PersistentVolumes().List(ctx, metav1.ListOptions{})
		cancel()
		if err != nil {
			continue
		}

		for _, pv := range pvs.Items {
			items = append(items, mapPersistentVolume(pv, cluster.ID, cluster.Name))
		}
	}
	response.Success(w, r, http.StatusOK, items)
}

func (h *StorageHandler) GetPersistentVolume(w http.ResponseWriter, r *http.Request) {
	pvName := strings.TrimSpace(chi.URLParam(r, "pvName"))
	if pvName == "" {
		response.Error(w, r, http.StatusBadRequest, "persistent volume name is required")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	pv, err := clientset.CoreV1().PersistentVolumes().Get(ctx, pvName, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapPersistentVolume(*pv, cluster.ID, cluster.Name))
}

type createPersistentVolumeRequest struct {
	Name             string            `json:"name"`
	Capacity         string            `json:"capacity"`
	AccessModes      []string          `json:"access_modes"`
	StorageClassName string            `json:"storage_class_name"`
	VolumeMode       string            `json:"volume_mode"`
	HostPath         string            `json:"host_path"`
	Labels           map[string]string `json:"labels"`
	Annotations      map[string]string `json:"annotations"`
}

func (h *StorageHandler) CreatePersistentVolume(w http.ResponseWriter, r *http.Request) {
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	var req createPersistentVolumeRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Capacity = strings.TrimSpace(req.Capacity)
	if req.Name == "" || req.Capacity == "" {
		response.Error(w, r, http.StatusBadRequest, "name and capacity are required")
		return
	}
	if len(req.AccessModes) == 0 {
		req.AccessModes = []string{"ReadWriteOnce"}
	}
	if strings.TrimSpace(req.VolumeMode) == "" {
		req.VolumeMode = string(corev1.PersistentVolumeFilesystem)
	}
	if strings.TrimSpace(req.HostPath) == "" {
		response.Error(w, r, http.StatusBadRequest, "host_path is required")
		return
	}

	quantity, err := parseQuantity(req.Capacity)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid capacity")
		return
	}

	accessModes := make([]corev1.PersistentVolumeAccessMode, 0, len(req.AccessModes))
	for _, mode := range req.AccessModes {
		trimmed := strings.TrimSpace(mode)
		if trimmed != "" {
			accessModes = append(accessModes, corev1.PersistentVolumeAccessMode(trimmed))
		}
	}
	if len(accessModes) == 0 {
		accessModes = []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce}
	}

	pv := &corev1.PersistentVolume{
		ObjectMeta: metav1.ObjectMeta{
			Name:        req.Name,
			Labels:      mapStringStringClone(req.Labels),
			Annotations: mapStringStringClone(req.Annotations),
		},
		Spec: corev1.PersistentVolumeSpec{
			Capacity:                      corev1.ResourceList{corev1.ResourceStorage: quantity},
			AccessModes:                   accessModes,
			PersistentVolumeReclaimPolicy: corev1.PersistentVolumeReclaimRetain,
			StorageClassName:              strings.TrimSpace(req.StorageClassName),
			VolumeMode: func() *corev1.PersistentVolumeMode {
				mode := corev1.PersistentVolumeMode(req.VolumeMode)
				return &mode
			}(),
			PersistentVolumeSource: corev1.PersistentVolumeSource{
				HostPath: &corev1.HostPathVolumeSource{Path: strings.TrimSpace(req.HostPath)},
			},
		},
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	created, err := clientset.CoreV1().PersistentVolumes().Create(ctx, pv, metav1.CreateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapPersistentVolume(*created, cluster.ID, cluster.Name))
}

func (h *StorageHandler) DeletePersistentVolume(w http.ResponseWriter, r *http.Request) {
	pvName := strings.TrimSpace(chi.URLParam(r, "pvName"))
	if pvName == "" {
		response.Error(w, r, http.StatusBadRequest, "persistent volume name is required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := clientset.CoreV1().PersistentVolumes().Delete(ctx, pvName, metav1.DeleteOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"message": fmt.Sprintf("持久卷 '%s' 已删除", pvName),
	})
}
func (h *StorageHandler) ListPersistentVolumeClaims(w http.ResponseWriter, r *http.Request) {
	clusters, err := h.listAccessibleClusters(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	namespace := strings.TrimSpace(r.URL.Query().Get("namespace"))

	items := make([]map[string]interface{}, 0)
	for i := range clusters {
		cluster := clusters[i]
		clientset, err := buildClientsetForCluster(&cluster)
		if err != nil {
			continue
		}
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		var pvcs *corev1.PersistentVolumeClaimList
		if namespace != "" {
			pvcs, err = clientset.CoreV1().PersistentVolumeClaims(namespace).List(ctx, metav1.ListOptions{})
		} else {
			pvcs, err = clientset.CoreV1().PersistentVolumeClaims(metav1.NamespaceAll).List(ctx, metav1.ListOptions{})
		}
		cancel()
		if err != nil {
			continue
		}

		for _, pvc := range pvcs.Items {
			items = append(items, mapPersistentVolumeClaim(pvc, cluster.ID, cluster.Name))
		}
	}

	response.Success(w, r, http.StatusOK, items)
}

func (h *StorageHandler) GetPersistentVolumeClaim(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	pvcName := strings.TrimSpace(chi.URLParam(r, "pvcName"))
	if namespace == "" || pvcName == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and pvc name are required")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	pvc, err := clientset.CoreV1().PersistentVolumeClaims(namespace).Get(ctx, pvcName, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapPersistentVolumeClaim(*pvc, cluster.ID, cluster.Name))
}

type createPersistentVolumeClaimRequest struct {
	Name             string            `json:"name"`
	Namespace        string            `json:"namespace"`
	AccessModes      []string          `json:"access_modes"`
	StorageClassName string            `json:"storage_class_name"`
	VolumeMode       string            `json:"volume_mode"`
	Requests         map[string]string `json:"requests"`
	Labels           map[string]string `json:"labels"`
	Annotations      map[string]string `json:"annotations"`
}

func (h *StorageHandler) CreatePersistentVolumeClaim(w http.ResponseWriter, r *http.Request) {
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	var req createPersistentVolumeClaimRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Namespace = strings.TrimSpace(req.Namespace)
	if req.Name == "" || req.Namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "name and namespace are required")
		return
	}
	if len(req.AccessModes) == 0 {
		req.AccessModes = []string{"ReadWriteOnce"}
	}
	if strings.TrimSpace(req.VolumeMode) == "" {
		req.VolumeMode = string(corev1.PersistentVolumeFilesystem)
	}

	requestStorage := "1Gi"
	if req.Requests != nil {
		if v := strings.TrimSpace(req.Requests["storage"]); v != "" {
			requestStorage = v
		}
	}
	qty, err := parseQuantity(requestStorage)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid requests.storage")
		return
	}

	accessModes := make([]corev1.PersistentVolumeAccessMode, 0, len(req.AccessModes))
	for _, mode := range req.AccessModes {
		trimmed := strings.TrimSpace(mode)
		if trimmed != "" {
			accessModes = append(accessModes, corev1.PersistentVolumeAccessMode(trimmed))
		}
	}
	if len(accessModes) == 0 {
		accessModes = []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce}
	}

	pvc := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:        req.Name,
			Namespace:   req.Namespace,
			Labels:      mapStringStringClone(req.Labels),
			Annotations: mapStringStringClone(req.Annotations),
		},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: accessModes,
			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{corev1.ResourceStorage: qty},
			},
			StorageClassName: func() *string {
				v := strings.TrimSpace(req.StorageClassName)
				if v == "" {
					return nil
				}
				return &v
			}(),
			VolumeMode: func() *corev1.PersistentVolumeMode {
				mode := corev1.PersistentVolumeMode(req.VolumeMode)
				return &mode
			}(),
		},
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	created, err := clientset.CoreV1().PersistentVolumeClaims(req.Namespace).Create(ctx, pvc, metav1.CreateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapPersistentVolumeClaim(*created, cluster.ID, cluster.Name))
}

func (h *StorageHandler) DeletePersistentVolumeClaim(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	pvcName := strings.TrimSpace(chi.URLParam(r, "pvcName"))
	if namespace == "" || pvcName == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and pvc name are required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := clientset.CoreV1().PersistentVolumeClaims(namespace).Delete(ctx, pvcName, metav1.DeleteOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"message": fmt.Sprintf("PVC '%s/%s' 已删除", namespace, pvcName),
	})
}

func (h *StorageHandler) BrowseVolumeFiles(w http.ResponseWriter, r *http.Request) {
	pvName := strings.TrimSpace(chi.URLParam(r, "pvName"))
	path := strings.TrimSpace(r.URL.Query().Get("path"))
	if path == "" {
		path = "/"
	}
	if pvName == "" {
		response.Error(w, r, http.StatusBadRequest, "pv name is required")
		return
	}

	files := mockBrowseFiles(path)
	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"files":        files,
		"current_path": path,
	})
}

func (h *StorageHandler) ReadVolumeFile(w http.ResponseWriter, r *http.Request) {
	filePath := strings.TrimSpace(r.URL.Query().Get("file_path"))
	if filePath == "" {
		response.Error(w, r, http.StatusBadRequest, "file_path is required")
		return
	}
	maxLines := parseIntWithDefault(r.URL.Query().Get("max_lines"), 0)

	content := mockReadFile(filePath)
	if maxLines > 0 {
		lines := strings.Split(content, "\n")
		if len(lines) > maxLines {
			content = strings.Join(lines[:maxLines], "\n")
		}
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"content":   content,
		"file_path": filePath,
	})
}

func mapPersistentVolume(pv corev1.PersistentVolume, clusterID uint, clusterName string) map[string]interface{} {
	capacity := ""
	if storage, ok := pv.Spec.Capacity[corev1.ResourceStorage]; ok {
		capacity = quantityString(storage)
	}

	claim := interface{}(nil)
	if pv.Spec.ClaimRef != nil && pv.Spec.ClaimRef.Namespace != "" && pv.Spec.ClaimRef.Name != "" {
		claim = fmt.Sprintf("%s/%s", pv.Spec.ClaimRef.Namespace, pv.Spec.ClaimRef.Name)
	}

	volumeMode := "Filesystem"
	if pv.Spec.VolumeMode != nil {
		volumeMode = string(*pv.Spec.VolumeMode)
	}

	return map[string]interface{}{
		"name":         pv.Name,
		"capacity":     capacity,
		"access_modes": pv.Spec.AccessModes,
		"status":       pv.Status.Phase,
		"claim":        claim,
		"storage_class": func() interface{} {
			if strings.TrimSpace(pv.Spec.StorageClassName) == "" {
				return nil
			}
			return pv.Spec.StorageClassName
		}(),
		"volume_mode":  volumeMode,
		"cluster_name": clusterName,
		"cluster_id":   clusterID,
	}
}

func mapPersistentVolumeClaim(pvc corev1.PersistentVolumeClaim, clusterID uint, clusterName string) map[string]interface{} {
	capacity := ""
	if storage, ok := pvc.Status.Capacity[corev1.ResourceStorage]; ok {
		capacity = quantityString(storage)
	}

	claimVolume := interface{}(nil)
	if strings.TrimSpace(pvc.Spec.VolumeName) != "" {
		claimVolume = pvc.Spec.VolumeName
	}

	storageClass := interface{}(nil)
	if pvc.Spec.StorageClassName != nil && strings.TrimSpace(*pvc.Spec.StorageClassName) != "" {
		storageClass = *pvc.Spec.StorageClassName
	}

	volumeMode := "Filesystem"
	if pvc.Spec.VolumeMode != nil {
		volumeMode = string(*pvc.Spec.VolumeMode)
	}

	return map[string]interface{}{
		"name":          pvc.Name,
		"namespace":     pvc.Namespace,
		"status":        pvc.Status.Phase,
		"volume":        claimVolume,
		"capacity":      capacity,
		"access_modes":  pvc.Spec.AccessModes,
		"storage_class": storageClass,
		"volume_mode":   volumeMode,
		"cluster_name":  clusterName,
		"cluster_id":    clusterID,
	}
}

func mockBrowseFiles(path string) []map[string]interface{} {
	switch path {
	case "/":
		return []map[string]interface{}{
			{"name": "example.txt", "type": "file", "size": 1024, "modified_time": "2024-01-01 12:00:00", "permissions": "-rw-r--r--"},
			{"name": "data", "type": "directory", "size": nil, "modified_time": "2024-01-01 12:00:00", "permissions": "drwxr-xr-x"},
		}
	case "/data":
		return []map[string]interface{}{
			{"name": "config.yaml", "type": "file", "size": 512, "modified_time": "2024-01-01 12:00:00", "permissions": "-rw-r--r--"},
			{"name": "logs", "type": "directory", "size": nil, "modified_time": "2024-01-01 12:00:00", "permissions": "drwxr-xr-x"},
		}
	default:
		return []map[string]interface{}{}
	}
}

func mockReadFile(filePath string) string {
	switch filePath {
	case "/example.txt":
		return "This is an example file content.\nLine 2\nLine 3\n"
	case "/data/config.yaml":
		return "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: example\n"
	default:
		return "File not found or cannot be read."
	}
}
