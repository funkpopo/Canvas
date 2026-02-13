package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/middleware"
	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/k8s"
	"canvas/backend/internal/models"
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
	batchv1 "k8s.io/api/batch/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"sigs.k8s.io/yaml"
)

type JobsHandler struct {
	Resolver *K8sResolver
	DB       *gorm.DB
}

func NewJobsHandler(resolver *K8sResolver, db *gorm.DB) *JobsHandler {
	return &JobsHandler{Resolver: resolver, DB: db}
}

func (h *JobsHandler) ListJobs(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	if namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace is required")
		return
	}
	namespace = normalizeJobsNamespace(namespace)

	cluster, clientset, err := h.resolvePathClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	jobList, err := clientset.BatchV1().Jobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(jobList.Items))
	for _, job := range jobList.Items {
		items = append(items, mapJobSummary(job, cluster.ID, cluster.Name))
	}
	sort.Slice(items, func(i, j int) bool {
		return fmt.Sprint(items[i]["name"]) < fmt.Sprint(items[j]["name"])
	})

	response.Success(w, r, http.StatusOK, items)
}

func (h *JobsHandler) GetJob(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	jobName := strings.TrimSpace(chi.URLParam(r, "jobName"))
	if namespace == "" || jobName == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and job name are required")
		return
	}

	cluster, clientset, err := h.resolvePathClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	job, err := clientset.BatchV1().Jobs(namespace).Get(ctx, jobName, metav1.GetOptions{})
	if err != nil {
		status := http.StatusBadGateway
		if apierrors.IsNotFound(err) {
			status = http.StatusNotFound
		}
		response.Error(w, r, status, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapJobDetails(*job, cluster.ID, cluster.Name))
}

type createJobRequest struct {
	YAMLContent string `json:"yaml_content"`
}

func (h *JobsHandler) CreateJob(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	if namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace is required")
		return
	}

	var req createJobRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.YAMLContent) == "" {
		response.Error(w, r, http.StatusBadRequest, "yaml_content is required")
		return
	}

	cluster, clientset, err := h.resolvePathClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	obj := &batchv1.Job{}
	if err := yaml.Unmarshal([]byte(req.YAMLContent), obj); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid job yaml")
		return
	}
	name := strings.TrimSpace(obj.Name)
	if name == "" {
		response.Error(w, r, http.StatusBadRequest, "metadata.name is required")
		return
	}
	obj.Namespace = namespace
	obj.ResourceVersion = ""
	obj.UID = ""
	obj.CreationTimestamp = metav1.Time{}
	obj.ManagedFields = nil
	obj.Generation = 0
	obj.SelfLink = ""
	obj.Status = batchv1.JobStatus{}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	created, err := clientset.BatchV1().Jobs(namespace).Create(ctx, obj, metav1.CreateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	currentUser, ok := middleware.CurrentUser(r)
	if ok {
		history := models.JobHistory{
			ClusterID: cluster.ID,
			Namespace: namespace,
			JobName:   created.Name,
			Status:    "Pending",
			CreatedBy: currentUser.ID,
		}
		if templateID := parseOptionalTemplateID(r.URL.Query().Get("template_id")); templateID != nil {
			history.TemplateID = templateID
		}
		_ = h.DB.Create(&history).Error
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"success":  true,
		"message":  fmt.Sprintf("Job '%s' 创建成功", created.Name),
		"job_name": created.Name,
	})
}
func (h *JobsHandler) DeleteJob(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	jobName := strings.TrimSpace(chi.URLParam(r, "jobName"))
	if namespace == "" || jobName == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and job name are required")
		return
	}

	_, clientset, err := h.resolvePathClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	propagation := metav1.DeletePropagationForeground
	err = clientset.BatchV1().Jobs(namespace).Delete(ctx, jobName, metav1.DeleteOptions{
		PropagationPolicy: &propagation,
		GracePeriodSeconds: func() *int64 {
			v := int64(30)
			return &v
		}(),
	})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Job '%s' 删除成功", jobName),
	})
}

func (h *JobsHandler) RestartJob(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	jobName := strings.TrimSpace(chi.URLParam(r, "jobName"))
	if namespace == "" || jobName == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and job name are required")
		return
	}

	cluster, clientset, err := h.resolvePathClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	job, err := clientset.BatchV1().Jobs(namespace).Get(ctx, jobName, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	newJobName := fmt.Sprintf("%s-%d", job.Name, time.Now().Unix())
	newJob := &batchv1.Job{
		TypeMeta: metav1.TypeMeta{Kind: "Job", APIVersion: "batch/v1"},
		ObjectMeta: metav1.ObjectMeta{
			Name:        newJobName,
			Namespace:   namespace,
			Labels:      mapStringStringClone(job.Labels),
			Annotations: mapStringStringClone(job.Annotations),
		},
		Spec: *job.Spec.DeepCopy(),
	}
	newJob.Spec.Selector = nil
	newJob.Spec.ManualSelector = nil
	newJob.Status = batchv1.JobStatus{}

	if _, err := clientset.BatchV1().Jobs(namespace).Create(ctx, newJob, metav1.CreateOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	currentUser, ok := middleware.CurrentUser(r)
	if ok {
		history := models.JobHistory{
			ClusterID: cluster.ID,
			Namespace: namespace,
			JobName:   newJobName,
			Status:    "Pending",
			CreatedBy: currentUser.ID,
		}
		_ = h.DB.Create(&history).Error
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"success":      true,
		"message":      fmt.Sprintf("Job '%s' 重启成功，新Job名称: '%s'", jobName, newJobName),
		"new_job_name": newJobName,
	})
}

func (h *JobsHandler) GetJobPods(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	jobName := strings.TrimSpace(chi.URLParam(r, "jobName"))
	if namespace == "" || jobName == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and job name are required")
		return
	}

	_, clientset, err := h.resolvePathClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	pods, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("job-name=%s", jobName),
	})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(pods.Items))
	for _, pod := range pods.Items {
		restarts := 0
		ready := 0
		total := len(pod.Status.ContainerStatuses)
		for _, cs := range pod.Status.ContainerStatuses {
			restarts += int(cs.RestartCount)
			if cs.Ready {
				ready++
			}
		}

		nodeName := interface{}(nil)
		if strings.TrimSpace(pod.Spec.NodeName) != "" {
			nodeName = pod.Spec.NodeName
		}

		items = append(items, map[string]interface{}{
			"name":             pod.Name,
			"namespace":        pod.Namespace,
			"status":           pod.Status.Phase,
			"node_name":        nodeName,
			"age":              k8s.CalculateAgeFromTime(pod.CreationTimestamp.Time),
			"restarts":         restarts,
			"ready_containers": fmt.Sprintf("%d/%d", ready, total),
			"labels":           mapStringStringClone(pod.Labels),
		})
	}
	sort.Slice(items, func(i, j int) bool {
		return fmt.Sprint(items[i]["name"]) < fmt.Sprint(items[j]["name"])
	})

	response.Success(w, r, http.StatusOK, items)
}

func (h *JobsHandler) GetJobYAML(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	jobName := strings.TrimSpace(chi.URLParam(r, "jobName"))
	if namespace == "" || jobName == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and job name are required")
		return
	}

	_, clientset, err := h.resolvePathClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	job, err := clientset.BatchV1().Jobs(namespace).Get(ctx, jobName, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	content, err := yaml.Marshal(job)
	if err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to marshal job")
		return
	}

	response.Success(w, r, http.StatusOK, map[string]string{"yaml_content": string(content)})
}

func (h *JobsHandler) UpdateJobYAML(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	jobName := strings.TrimSpace(chi.URLParam(r, "jobName"))
	if namespace == "" || jobName == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and job name are required")
		return
	}

	var req createJobRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.YAMLContent) == "" {
		response.Error(w, r, http.StatusBadRequest, "yaml_content is required")
		return
	}

	_, clientset, err := h.resolvePathClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	obj := &batchv1.Job{}
	if err := yaml.Unmarshal([]byte(req.YAMLContent), obj); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid job yaml")
		return
	}
	obj.Namespace = namespace
	obj.Name = jobName

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	current, err := clientset.BatchV1().Jobs(namespace).Get(ctx, jobName, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}
	obj.ResourceVersion = current.ResourceVersion

	if _, err := clientset.BatchV1().Jobs(namespace).Update(ctx, obj, metav1.UpdateOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Job '%s' 更新成功", jobName),
	})
}

type createJobTemplateRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
	Category    *string `json:"category"`
	YAMLContent string  `json:"yaml_content"`
	IsPublic    *bool   `json:"is_public"`
}

func (h *JobsHandler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}

	category := strings.TrimSpace(r.URL.Query().Get("category"))
	query := h.DB.Model(&models.JobTemplate{}).
		Where("is_deleted = ?", false).
		Where("is_public = ? OR created_by = ?", true, currentUser.ID)
	if category != "" {
		query = query.Where("category = ?", category)
	}

	var templates []models.JobTemplate
	if err := query.Order("created_at DESC").Find(&templates).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	items := make([]map[string]interface{}, 0, len(templates))
	for _, template := range templates {
		updated := template.CreatedAt
		if template.UpdatedAt != nil {
			updated = *template.UpdatedAt
		}
		items = append(items, map[string]interface{}{
			"id":          template.ID,
			"name":        template.Name,
			"description": template.Description,
			"category":    template.Category,
			"is_public":   template.IsPublic,
			"created_by":  template.CreatedBy,
			"created_at":  formatTimeRFC3339(template.CreatedAt),
			"updated_at":  formatTimeRFC3339(updated),
		})
	}

	response.Success(w, r, http.StatusOK, items)
}

func (h *JobsHandler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}

	var req createJobTemplateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.YAMLContent = strings.TrimSpace(req.YAMLContent)
	if req.Name == "" || req.YAMLContent == "" {
		response.Error(w, r, http.StatusBadRequest, "name and yaml_content are required")
		return
	}

	var count int64
	if err := h.DB.Model(&models.JobTemplate{}).
		Where("name = ? AND is_deleted = ?", req.Name, false).
		Count(&count).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}
	if count > 0 {
		response.Error(w, r, http.StatusBadRequest, "模板名称已存在")
		return
	}

	isPublic := true
	if req.IsPublic != nil {
		isPublic = *req.IsPublic
	}
	template := models.JobTemplate{
		Name:        req.Name,
		Description: trimStringPtr(req.Description),
		Category:    trimStringPtr(req.Category),
		YAMLContent: req.YAMLContent,
		IsPublic:    isPublic,
		CreatedBy:   currentUser.ID,
	}
	if err := h.DB.Create(&template).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to create template")
		return
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"success":     true,
		"message":     "模板创建成功",
		"template_id": template.ID,
	})
}

func (h *JobsHandler) GetTemplate(w http.ResponseWriter, r *http.Request) {
	templateID, err := parsePathUint(chi.URLParam(r, "templateID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid template id")
		return
	}
	currentUser, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}

	var template models.JobTemplate
	if err := h.DB.Where("is_deleted = ?", false).First(&template, templateID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "模板不存在")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	if !template.IsPublic && template.CreatedBy != currentUser.ID {
		response.Error(w, r, http.StatusForbidden, "无权访问此模板")
		return
	}

	updated := template.CreatedAt
	if template.UpdatedAt != nil {
		updated = *template.UpdatedAt
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"id":           template.ID,
		"name":         template.Name,
		"description":  template.Description,
		"category":     template.Category,
		"yaml_content": template.YAMLContent,
		"is_public":    template.IsPublic,
		"created_by":   template.CreatedBy,
		"created_at":   formatTimeRFC3339(template.CreatedAt),
		"updated_at":   formatTimeRFC3339(updated),
	})
}

type updateJobTemplateRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	Category    *string `json:"category"`
	YAMLContent *string `json:"yaml_content"`
	IsPublic    *bool   `json:"is_public"`
}

func (h *JobsHandler) UpdateTemplate(w http.ResponseWriter, r *http.Request) {
	templateID, err := parsePathUint(chi.URLParam(r, "templateID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid template id")
		return
	}
	currentUser, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}

	var req updateJobTemplateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	var template models.JobTemplate
	if err := h.DB.Where("is_deleted = ?", false).First(&template, templateID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "模板不存在")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	if template.CreatedBy != currentUser.ID {
		response.Error(w, r, http.StatusForbidden, "无权修改此模板")
		return
	}

	if req.Name != nil {
		trimmed := strings.TrimSpace(*req.Name)
		if trimmed == "" {
			response.Error(w, r, http.StatusBadRequest, "name cannot be empty")
			return
		}
		template.Name = trimmed
	}
	if req.Description != nil {
		template.Description = trimStringPtr(req.Description)
	}
	if req.Category != nil {
		template.Category = trimStringPtr(req.Category)
	}
	if req.YAMLContent != nil {
		trimmed := strings.TrimSpace(*req.YAMLContent)
		if trimmed == "" {
			response.Error(w, r, http.StatusBadRequest, "yaml_content cannot be empty")
			return
		}
		template.YAMLContent = trimmed
	}
	if req.IsPublic != nil {
		template.IsPublic = *req.IsPublic
	}
	updatedAt := time.Now().UTC()
	template.UpdatedAt = &updatedAt

	if err := h.DB.Save(&template).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to update template")
		return
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "模板更新成功",
	})
}

func (h *JobsHandler) DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	templateID, err := parsePathUint(chi.URLParam(r, "templateID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid template id")
		return
	}
	currentUser, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}

	var template models.JobTemplate
	if err := h.DB.Where("is_deleted = ?", false).First(&template, templateID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "模板不存在")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	if template.CreatedBy != currentUser.ID {
		response.Error(w, r, http.StatusForbidden, "无权删除此模板")
		return
	}

	if err := h.DB.Delete(&template).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to delete template")
		return
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "模板删除成功",
	})
}

type bulkDeleteJobsRequest struct {
	JobNames []string `json:"job_names"`
}

func (h *JobsHandler) BulkDeleteJobs(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	if namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace is required")
		return
	}

	var req bulkDeleteJobsRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.JobNames) == 0 {
		response.Error(w, r, http.StatusBadRequest, "job_names cannot be empty")
		return
	}

	_, clientset, err := h.resolvePathClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	results := make([]map[string]interface{}, 0, len(req.JobNames))
	successCount := 0
	propagation := metav1.DeletePropagationForeground

	for _, rawName := range req.JobNames {
		jobName := strings.TrimSpace(rawName)
		if jobName == "" {
			continue
		}
		err := clientset.BatchV1().Jobs(namespace).Delete(ctx, jobName, metav1.DeleteOptions{
			PropagationPolicy: &propagation,
		})
		if err != nil {
			results = append(results, map[string]interface{}{
				"job_name": jobName,
				"success":  false,
				"message":  fmt.Sprintf("删除失败: %v", err),
			})
			continue
		}
		successCount++
		results = append(results, map[string]interface{}{
			"job_name": jobName,
			"success":  true,
			"message":  fmt.Sprintf("Job '%s' 删除成功", jobName),
		})
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"success": successCount > 0,
		"message": fmt.Sprintf("批量删除完成，成功: %d/%d", successCount, len(req.JobNames)),
		"results": results,
	})
}

func (h *JobsHandler) GetJobsStatusOverview(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	if namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace is required")
		return
	}

	cluster, clientset, err := h.resolvePathClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	jobList, err := clientset.BatchV1().Jobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	jobs := make([]map[string]interface{}, 0, len(jobList.Items))
	statusCounts := map[string]int{}
	for _, job := range jobList.Items {
		mapped := mapJobSummary(job, cluster.ID, cluster.Name)
		status := fmt.Sprint(mapped["status"])
		statusCounts[status] = statusCounts[status] + 1
		jobs = append(jobs, mapped)
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"total_jobs":    len(jobs),
		"status_counts": statusCounts,
		"jobs":          jobs,
	})
}

func (h *JobsHandler) ListHistory(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}

	clusterID := parseIntWithDefault(strings.TrimSpace(r.URL.Query().Get("cluster_id")), 0)
	namespace := strings.TrimSpace(r.URL.Query().Get("namespace"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	startDate := strings.TrimSpace(r.URL.Query().Get("start_date"))
	endDate := strings.TrimSpace(r.URL.Query().Get("end_date"))
	limit := parseIntWithDefault(strings.TrimSpace(r.URL.Query().Get("limit")), 50)
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}

	query := h.DB.Model(&models.JobHistory{}).Where("created_by = ?", currentUser.ID)
	if clusterID > 0 {
		query = query.Where("cluster_id = ?", clusterID)
	}
	if namespace != "" {
		query = query.Where("namespace = ?", namespace)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if startDate != "" {
		start, err := time.Parse("2006-01-02", startDate)
		if err != nil {
			response.Error(w, r, http.StatusBadRequest, "invalid start_date format")
			return
		}
		query = query.Where("created_at >= ?", start.UTC())
	}
	if endDate != "" {
		end, err := time.Parse("2006-01-02", endDate)
		if err != nil {
			response.Error(w, r, http.StatusBadRequest, "invalid end_date format")
			return
		}
		end = end.UTC().Add(23*time.Hour + 59*time.Minute + 59*time.Second)
		query = query.Where("created_at <= ?", end)
	}

	var records []models.JobHistory
	if err := query.Order("created_at DESC").Limit(limit).Find(&records).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	items := make([]map[string]interface{}, 0, len(records))
	for _, record := range records {
		updated := record.CreatedAt
		if record.UpdatedAt != nil {
			updated = *record.UpdatedAt
		}
		items = append(items, map[string]interface{}{
			"id":             record.ID,
			"cluster_id":     record.ClusterID,
			"namespace":      record.Namespace,
			"job_name":       record.JobName,
			"template_id":    record.TemplateID,
			"status":         record.Status,
			"start_time":     formatTimePtrRFC3339(record.StartTime),
			"end_time":       formatTimePtrRFC3339(record.EndTime),
			"duration":       record.Duration,
			"succeeded_pods": record.SucceededPods,
			"failed_pods":    record.FailedPods,
			"total_pods":     record.TotalPods,
			"error_message":  record.ErrorMessage,
			"created_by":     record.CreatedBy,
			"created_at":     formatTimeRFC3339(record.CreatedAt),
			"updated_at":     formatTimeRFC3339(updated),
		})
	}

	response.Success(w, r, http.StatusOK, items)
}

type updateJobHistoryStatusRequest struct {
	Status        string  `json:"status"`
	SucceededPods *int    `json:"succeeded_pods"`
	FailedPods    *int    `json:"failed_pods"`
	TotalPods     *int    `json:"total_pods"`
	ErrorMessage  *string `json:"error_message"`
}

func (h *JobsHandler) UpdateHistoryStatus(w http.ResponseWriter, r *http.Request) {
	historyID, err := parsePathUint(chi.URLParam(r, "historyID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid history id")
		return
	}
	currentUser, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}

	var req updateJobHistoryStatusRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Status = strings.TrimSpace(req.Status)
	if req.Status == "" {
		response.Error(w, r, http.StatusBadRequest, "status is required")
		return
	}

	var record models.JobHistory
	if err := h.DB.Where("id = ? AND created_by = ?", historyID, currentUser.ID).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "历史记录不存在")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	record.Status = req.Status
	if req.SucceededPods != nil {
		record.SucceededPods = *req.SucceededPods
	}
	if req.FailedPods != nil {
		record.FailedPods = *req.FailedPods
	}
	if req.TotalPods != nil {
		record.TotalPods = *req.TotalPods
	} else if req.SucceededPods != nil || req.FailedPods != nil {
		record.TotalPods = record.SucceededPods + record.FailedPods
	}
	if req.ErrorMessage != nil {
		record.ErrorMessage = trimStringPtr(req.ErrorMessage)
	}

	now := time.Now().UTC()
	if req.Status == "Running" && record.StartTime == nil {
		record.StartTime = &now
	}
	if (req.Status == "Succeeded" || req.Status == "Failed") && record.EndTime == nil {
		record.EndTime = &now
		if record.StartTime != nil {
			duration := int(now.Sub(*record.StartTime).Seconds())
			record.Duration = &duration
		}
	}
	record.UpdatedAt = &now

	if err := h.DB.Save(&record).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to update history")
		return
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "状态更新成功",
	})
}

func (h *JobsHandler) MonitorJobStatus(w http.ResponseWriter, r *http.Request) {
	historyID, err := parsePathUint(chi.URLParam(r, "historyID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid history id")
		return
	}
	currentUser, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}

	var history models.JobHistory
	if err := h.DB.Where("id = ? AND created_by = ?", historyID, currentUser.ID).First(&history).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "历史记录不存在")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	_, clientset, err := h.resolveClusterClientByID(currentUser, history.ClusterID)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	job, err := clientset.BatchV1().Jobs(history.Namespace).Get(ctx, history.JobName, metav1.GetOptions{})
	if err != nil {
		now := time.Now().UTC()
		errorMsg := fmt.Sprintf("Job不存在或获取失败: %v", err)
		history.Status = "Failed"
		history.ErrorMessage = &errorMsg
		if history.EndTime == nil {
			history.EndTime = &now
			if history.StartTime != nil {
				duration := int(now.Sub(*history.StartTime).Seconds())
				history.Duration = &duration
			}
		}
		history.UpdatedAt = &now
		_ = h.DB.Save(&history).Error

		response.Success(w, r, http.StatusOK, map[string]interface{}{
			"success": false,
			"message": errorMsg,
		})
		return
	}

	status := jobPrimaryStatus(*job)
	succeeded := int(job.Status.Succeeded)
	failed := int(job.Status.Failed)
	active := int(job.Status.Active)
	total := succeeded + failed + active

	statusChanged := history.Status != status
	podCountChanged := history.SucceededPods != succeeded || history.FailedPods != failed || history.TotalPods != total

	if statusChanged || podCountChanged {
		now := time.Now().UTC()
		history.Status = status
		history.SucceededPods = succeeded
		history.FailedPods = failed
		history.TotalPods = total
		if status == "Running" && history.StartTime == nil {
			history.StartTime = &now
		}
		if (status == "Succeeded" || status == "Failed") && history.EndTime == nil {
			history.EndTime = &now
			if history.StartTime != nil {
				duration := int(now.Sub(*history.StartTime).Seconds())
				history.Duration = &duration
			}
		}
		history.UpdatedAt = &now
		_ = h.DB.Save(&history).Error

		response.Success(w, r, http.StatusOK, map[string]interface{}{
			"success":           true,
			"message":           "状态已更新",
			"status_changed":    statusChanged,
			"pod_count_changed": podCountChanged,
			"current_status":    status,
			"succeeded_pods":    succeeded,
			"failed_pods":       failed,
			"total_pods":        total,
		})
		return
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"success":           true,
		"message":           "状态无变化",
		"status_changed":    false,
		"pod_count_changed": false,
	})
}
func (h *JobsHandler) resolvePathClusterClient(r *http.Request) (*models.Cluster, *kubernetes.Clientset, error) {
	clusterIDRaw := strings.TrimSpace(chi.URLParam(r, "clusterID"))
	clusterID, err := strconv.ParseUint(clusterIDRaw, 10, 64)
	if err != nil || clusterID == 0 {
		return nil, nil, fmt.Errorf("invalid cluster id")
	}

	user, ok := middleware.CurrentUser(r)
	if !ok {
		return nil, nil, fmt.Errorf("authentication required")
	}
	return h.resolveClusterClientByID(user, uint(clusterID))
}

func (h *JobsHandler) resolveClusterClientByID(user *models.User, clusterID uint) (*models.Cluster, *kubernetes.Clientset, error) {
	cluster, err := h.Resolver.Service.GetClusterForUser(clusterID, user)
	if err != nil {
		return nil, nil, err
	}

	cfg, err := k8s.BuildConfig(cluster)
	if err != nil {
		return nil, nil, err
	}
	clientset, err := k8s.NewClientset(cfg)
	if err != nil {
		return nil, nil, err
	}
	return cluster, clientset, nil
}

func mapJobSummary(job batchv1.Job, clusterID uint, clusterName string) map[string]interface{} {
	completions := int32(1)
	if job.Spec.Completions != nil {
		completions = *job.Spec.Completions
	}

	return map[string]interface{}{
		"name":         job.Name,
		"namespace":    job.Namespace,
		"completions":  completions,
		"succeeded":    job.Status.Succeeded,
		"failed":       job.Status.Failed,
		"active":       job.Status.Active,
		"age":          k8s.CalculateAgeFromTime(job.CreationTimestamp.Time),
		"status":       jobPrimaryStatus(job),
		"labels":       mapStringStringClone(job.Labels),
		"cluster_id":   clusterID,
		"cluster_name": clusterName,
	}
}

func mapJobDetails(job batchv1.Job, clusterID uint, clusterName string) map[string]interface{} {
	payload := mapJobSummary(job, clusterID, clusterName)

	parallelism := int32(1)
	if job.Spec.Parallelism != nil {
		parallelism = *job.Spec.Parallelism
	}
	backoffLimit := int32(6)
	if job.Spec.BackoffLimit != nil {
		backoffLimit = *job.Spec.BackoffLimit
	}

	conditions := make([]map[string]interface{}, 0, len(job.Status.Conditions))
	for _, c := range job.Status.Conditions {
		conditions = append(conditions, map[string]interface{}{
			"type":                 c.Type,
			"status":               c.Status,
			"last_transition_time": c.LastTransitionTime.Time.UTC().Format(time.RFC3339),
			"reason":               c.Reason,
			"message":              c.Message,
		})
	}

	specMap := map[string]interface{}{}
	statusMap := map[string]interface{}{}
	_ = convertViaJSON(job.Spec, &specMap)
	_ = convertViaJSON(job.Status, &statusMap)

	payload["parallelism"] = parallelism
	payload["backoff_limit"] = backoffLimit
	payload["creation_timestamp"] = job.CreationTimestamp.Time.UTC().Format(time.RFC3339)
	payload["conditions"] = conditions
	payload["annotations"] = mapStringStringClone(job.Annotations)
	payload["spec"] = specMap
	payload["status_detail"] = statusMap
	return payload
}

func jobPrimaryStatus(job batchv1.Job) string {
	if len(job.Status.Conditions) > 0 {
		latest := job.Status.Conditions[0]
		for i := 1; i < len(job.Status.Conditions); i++ {
			if job.Status.Conditions[i].LastTransitionTime.After(latest.LastTransitionTime.Time) {
				latest = job.Status.Conditions[i]
			}
		}
		return string(latest.Type)
	}

	if job.Status.Active > 0 {
		return "Running"
	}
	if job.Status.Succeeded > 0 {
		if job.Spec.Completions == nil || job.Status.Succeeded >= *job.Spec.Completions {
			return "Succeeded"
		}
		return "Running"
	}
	if job.Status.Failed > 0 {
		return "Failed"
	}
	return "Pending"
}

func parseOptionalTemplateID(raw string) *uint {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	parsed, err := strconv.ParseUint(trimmed, 10, 64)
	if err != nil {
		return nil
	}
	value := uint(parsed)
	return &value
}

func trimStringPtr(v *string) *string {
	if v == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*v)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func normalizeJobsNamespace(namespace string) string {
	switch strings.ToLower(strings.TrimSpace(namespace)) {
	case "*", "all", "__all__":
		return metav1.NamespaceAll
	default:
		return namespace
	}
}
