package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/k8s"
	"github.com/go-chi/chi/v5"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"sigs.k8s.io/yaml"
)

type ServiceHandler struct {
	Resolver *K8sResolver
}

func NewServiceHandler(resolver *K8sResolver) *ServiceHandler {
	return &ServiceHandler{Resolver: resolver}
}

func (h *ServiceHandler) List(w http.ResponseWriter, r *http.Request) {
	h.listWithPageMode(w, r, false)
}

func (h *ServiceHandler) ListPage(w http.ResponseWriter, r *http.Request) {
	h.listWithPageMode(w, r, true)
}

func (h *ServiceHandler) listWithPageMode(w http.ResponseWriter, r *http.Request, paged bool) {
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	namespace := strings.TrimSpace(r.URL.Query().Get("namespace"))
	limit := int64(parseIntWithDefault(r.URL.Query().Get("limit"), 100))
	if limit <= 0 {
		limit = 100
	}
	continueToken := strings.TrimSpace(r.URL.Query().Get("continue_token"))
	labelSelector := strings.TrimSpace(r.URL.Query().Get("label_selector"))

	opts := metav1.ListOptions{LabelSelector: labelSelector}
	if paged {
		opts.Limit = limit
		opts.Continue = continueToken
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	var svcs *corev1.ServiceList
	if namespace != "" {
		svcs, err = clientset.CoreV1().Services(namespace).List(ctx, opts)
	} else {
		svcs, err = clientset.CoreV1().Services("").List(ctx, opts)
	}
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(svcs.Items))
	for _, svc := range svcs.Items {
		items = append(items, mapService(svc, cluster.ID, cluster.Name))
	}

	if paged {
		response.Success(w, r, http.StatusOK, map[string]interface{}{
			"items":          items,
			"continue_token": nullIfEmpty(svcs.Continue),
		})
		return
	}
	response.Success(w, r, http.StatusOK, items)
}

func (h *ServiceHandler) Get(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "serviceName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and service name are required")
		return
	}
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	svc, err := clientset.CoreV1().Services(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, r, http.StatusOK, mapService(*svc, cluster.ID, cluster.Name))
}

func (h *ServiceHandler) Create(w http.ResponseWriter, r *http.Request) {
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	obj, err := decodeServicePayload(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	created, err := clientset.CoreV1().Services(obj.Namespace).Create(ctx, obj, metav1.CreateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.Success(w, r, http.StatusCreated, mapService(*created, cluster.ID, cluster.Name))
}

func (h *ServiceHandler) Update(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "serviceName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and service name are required")
		return
	}
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	obj, err := decodeServicePayload(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	obj.Namespace = namespace
	obj.Name = name
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	updated, err := clientset.CoreV1().Services(namespace).Update(ctx, obj, metav1.UpdateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.Success(w, r, http.StatusOK, mapService(*updated, cluster.ID, cluster.Name))
}

func (h *ServiceHandler) Delete(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "serviceName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and service name are required")
		return
	}
	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := clientset.CoreV1().Services(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.NoContent(w)
}

func (h *ServiceHandler) GetYAML(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "serviceName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and service name are required")
		return
	}
	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	svc, err := clientset.CoreV1().Services(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}
	content, err := yaml.Marshal(svc)
	if err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to marshal service")
		return
	}
	response.Success(w, r, http.StatusOK, map[string]string{"yaml": string(content)})
}

func (h *ServiceHandler) UpdateYAML(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "serviceName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and service name are required")
		return
	}
	var req yamlUpdateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	content := strings.TrimSpace(req.YAML)
	if content == "" {
		content = strings.TrimSpace(req.YAMLContent)
	}
	if content == "" {
		response.Error(w, r, http.StatusBadRequest, "yaml content is required")
		return
	}
	obj := &corev1.Service{}
	if err := yaml.Unmarshal([]byte(content), obj); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid service yaml")
		return
	}
	obj.Namespace = namespace
	obj.Name = name

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	updated, err := clientset.CoreV1().Services(namespace).Update(ctx, obj, metav1.UpdateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.Success(w, r, http.StatusOK, mapService(*updated, cluster.ID, cluster.Name))
}

type servicePayload struct {
	YAMLContent string                   `json:"yaml_content"`
	YAML        string                   `json:"yaml"`
	Name        string                   `json:"name"`
	Namespace   string                   `json:"namespace"`
	Type        string                   `json:"type"`
	Selector    map[string]string        `json:"selector"`
	Labels      map[string]string        `json:"labels"`
	Ports       []map[string]interface{} `json:"ports"`
}

func decodeServicePayload(r *http.Request) (*corev1.Service, error) {
	var req servicePayload
	if err := response.DecodeJSON(r, &req); err != nil {
		return nil, fmt.Errorf("invalid request body")
	}

	content := strings.TrimSpace(req.YAMLContent)
	if content == "" {
		content = strings.TrimSpace(req.YAML)
	}
	if content != "" {
		obj := &corev1.Service{}
		if err := yaml.Unmarshal([]byte(content), obj); err != nil {
			return nil, fmt.Errorf("invalid service yaml")
		}
		if obj.Namespace == "" {
			obj.Namespace = strings.TrimSpace(req.Namespace)
		}
		if obj.Namespace == "" {
			obj.Namespace = "default"
		}
		if obj.Name == "" {
			obj.Name = strings.TrimSpace(req.Name)
		}
		if obj.Name == "" {
			return nil, fmt.Errorf("service name is required")
		}
		return obj, nil
	}

	name := strings.TrimSpace(req.Name)
	ns := strings.TrimSpace(req.Namespace)
	if ns == "" {
		ns = "default"
	}
	if name == "" {
		return nil, fmt.Errorf("service name is required")
	}

	svcType := corev1.ServiceTypeClusterIP
	if strings.TrimSpace(req.Type) != "" {
		svcType = corev1.ServiceType(req.Type)
	}
	ports := make([]corev1.ServicePort, 0, len(req.Ports))
	for _, portMap := range req.Ports {
		portNum, ok := toInt32(portMap["port"])
		if !ok || portNum <= 0 {
			continue
		}
		targetPort := intstr.FromInt(int(portNum))
		if v, ok := portMap["target_port"]; ok {
			switch cast := v.(type) {
			case string:
				targetPort = intstr.Parse(cast)
			default:
				if asInt, ok := toInt32(cast); ok {
					targetPort = intstr.FromInt(int(asInt))
				}
			}
		}
		servicePort := corev1.ServicePort{
			Port:       portNum,
			TargetPort: targetPort,
			Protocol:   corev1.ProtocolTCP,
		}
		if n, ok := portMap["name"]; ok {
			servicePort.Name = fmt.Sprint(n)
		}
		if proto, ok := portMap["protocol"]; ok {
			servicePort.Protocol = corev1.Protocol(fmt.Sprint(proto))
		}
		ports = append(ports, servicePort)
	}
	if len(ports) == 0 {
		ports = append(ports, corev1.ServicePort{Port: 80, TargetPort: intstr.FromInt(80), Protocol: corev1.ProtocolTCP})
	}

	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns, Labels: req.Labels},
		Spec: corev1.ServiceSpec{
			Type:     svcType,
			Selector: req.Selector,
			Ports:    ports,
		},
	}, nil
}

func mapService(svc corev1.Service, clusterID uint, clusterName string) map[string]interface{} {
	externalIP := interface{}(nil)
	if len(svc.Spec.ExternalIPs) > 0 {
		externalIP = svc.Spec.ExternalIPs[0]
	}
	ports := make([]map[string]interface{}, 0, len(svc.Spec.Ports))
	for _, p := range svc.Spec.Ports {
		item := map[string]interface{}{
			"port":        p.Port,
			"target_port": p.TargetPort.String(),
			"protocol":    string(p.Protocol),
		}
		if p.Name != "" {
			item["name"] = p.Name
		}
		if p.NodePort > 0 {
			item["node_port"] = p.NodePort
		}
		ports = append(ports, item)
	}
	return map[string]interface{}{
		"id":           fmt.Sprintf("%s/%s", svc.Namespace, svc.Name),
		"name":         svc.Name,
		"namespace":    svc.Namespace,
		"type":         string(svc.Spec.Type),
		"cluster_ip":   svc.Spec.ClusterIP,
		"external_ip":  externalIP,
		"ports":        ports,
		"selector":     svc.Spec.Selector,
		"labels":       svc.Labels,
		"age":          k8s.CalculateAgeFromTime(svc.CreationTimestamp.Time),
		"cluster_id":   clusterID,
		"cluster_name": clusterName,
	}
}

func quantityMapToStringMap(q corev1.ResourceList) map[string]string {
	out := map[string]string{}
	for k, v := range q {
		out[string(k)] = v.String()
	}
	return out
}

func parseQuantityOrNil(raw interface{}) *resource.Quantity {
	if raw == nil {
		return nil
	}
	q, err := resource.ParseQuantity(fmt.Sprint(raw))
	if err != nil {
		return nil
	}
	return &q
}
