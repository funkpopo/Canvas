package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/k8s"
	"github.com/go-chi/chi/v5"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type NodeHandler struct {
	Resolver *K8sResolver
}

func NewNodeHandler(resolver *K8sResolver) *NodeHandler {
	return &NodeHandler{Resolver: resolver}
}

func (h *NodeHandler) List(w http.ResponseWriter, r *http.Request) {
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	nodes, err := clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(nodes.Items))
	for _, node := range nodes.Items {
		items = append(items, formatNode(node, cluster.ID, cluster.Name))
	}
	response.Success(w, r, http.StatusOK, items)
}

func (h *NodeHandler) Get(w http.ResponseWriter, r *http.Request) {
	nodeName := strings.TrimSpace(chi.URLParam(r, "nodeName"))
	if nodeName == "" {
		response.Error(w, r, http.StatusBadRequest, "node name is required")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	node, err := clientset.CoreV1().Nodes().Get(ctx, nodeName, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, formatNode(*node, cluster.ID, cluster.Name))
}

func formatNode(node corev1.Node, clusterID uint, clusterName string) map[string]interface{} {
	status := "Unknown"
	for _, cond := range node.Status.Conditions {
		if cond.Type == corev1.NodeReady {
			if cond.Status == corev1.ConditionTrue {
				status = "Ready"
			} else {
				status = "NotReady"
			}
			break
		}
	}

	roles := make([]string, 0)
	for key := range node.Labels {
		if strings.HasPrefix(key, "node-role.kubernetes.io/") {
			role := strings.TrimPrefix(key, "node-role.kubernetes.io/")
			if role == "" {
				role = "worker"
			}
			roles = append(roles, role)
		}
	}
	if len(roles) == 0 {
		roles = append(roles, "worker")
	}

	internalIP := ""
	externalIP := ""
	for _, addr := range node.Status.Addresses {
		switch addr.Type {
		case corev1.NodeInternalIP:
			internalIP = addr.Address
		case corev1.NodeExternalIP:
			externalIP = addr.Address
		}
	}

	taints := make([]map[string]string, 0)
	for _, taint := range node.Spec.Taints {
		taints = append(taints, map[string]string{
			"key":    taint.Key,
			"value":  taint.Value,
			"effect": string(taint.Effect),
		})
	}

	createdAt := node.CreationTimestamp.Time
	return map[string]interface{}{
		"name":              node.Name,
		"status":            status,
		"roles":             roles,
		"age":               k8s.CalculateAgeFromTime(createdAt),
		"version":           node.Status.NodeInfo.KubeletVersion,
		"internal_ip":       internalIP,
		"external_ip":       externalIP,
		"os_image":          node.Status.NodeInfo.OSImage,
		"kernel_version":    node.Status.NodeInfo.KernelVersion,
		"container_runtime": node.Status.NodeInfo.ContainerRuntimeVersion,
		"cpu_capacity":      node.Status.Capacity.Cpu().String(),
		"memory_capacity":   node.Status.Capacity.Memory().String(),
		"pod_capacity":      node.Status.Capacity.Pods().String(),
		"labels":            node.Labels,
		"taints":            taints,
		"cluster_id":        clusterID,
		"cluster_name":      clusterName,
	}
}
