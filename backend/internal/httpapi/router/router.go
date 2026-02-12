package router

import (
	"net/http"
	"time"

	"canvas/backend/internal/config"
	"canvas/backend/internal/httpapi/handlers"
	appmw "canvas/backend/internal/httpapi/middleware"
	"canvas/backend/internal/k8s"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"gorm.io/gorm"
)

func New(db *gorm.DB, cfg config.Settings) http.Handler {
	r := chi.NewRouter()

	r.Use(chimw.RealIP)
	r.Use(chimw.StripSlashes)
	r.Use(chimw.Timeout(60 * time.Second))
	r.Use(appmw.RequestID)
	r.Use(appmw.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-API-Key"},
		ExposedHeaders:   []string{"X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	systemHandler := handlers.NewSystemHandler()
	authHandler := handlers.NewAuthHandler(db, cfg)
	userHandler := handlers.NewUserHandler(db)
	clusterHandler := handlers.NewClusterHandler(db)
	statsHandler := handlers.NewStatsHandler(db)
	permissionHandler := handlers.NewPermissionHandler(db)
	auditLogHandler := handlers.NewAuditLogHandler(db)
	alertHandler := handlers.NewAlertHandler(db)
	monitoringHandler := handlers.NewMonitoringHandler()

	k8sService := k8s.NewService(db)
	k8sResolver := handlers.NewK8sResolver(k8sService)
	nodeHandler := handlers.NewNodeHandler(k8sResolver)
	namespaceHandler := handlers.NewNamespaceHandler(k8sResolver)
	podHandler := handlers.NewPodHandler(k8sResolver)
	deploymentHandler := handlers.NewDeploymentHandler(k8sResolver)
	serviceHandler := handlers.NewServiceHandler(k8sResolver)
	configMapHandler := handlers.NewConfigMapHandler(k8sResolver)
	secretHandler := handlers.NewSecretHandler(k8sResolver)
	resourceQuotaHandler := handlers.NewResourceQuotaHandler(k8sResolver)
	networkPolicyHandler := handlers.NewNetworkPolicyHandler(k8sResolver)
	eventHandler := handlers.NewEventHandler(k8sResolver)
	workloadHandler := handlers.NewWorkloadHandler(k8sResolver)
	jobHandler := handlers.NewJobsHandler(k8sResolver, db)
	storageHandler := handlers.NewStorageHandler(k8sResolver, db)
	rbacHandler := handlers.NewRBACHandler(k8sResolver)
	metricsHandler := handlers.NewMetricsHandler(k8sResolver)
	websocketHandler := handlers.NewWebsocketHandler()

	authMiddleware := appmw.Auth{DB: db, Config: cfg}

	r.Get("/", systemHandler.Root)
	r.Get("/health", systemHandler.Health)

	r.Route("/api", func(api chi.Router) {
		api.Route("/auth", func(auth chi.Router) {
			auth.Post("/register", authHandler.Register)
			auth.Post("/login", authHandler.Login)
			auth.Post("/token", authHandler.TokenLogin)
			auth.Post("/refresh", authHandler.Refresh)
			auth.With(authMiddleware.RequireAuth).Post("/logout", authHandler.Logout)
			auth.With(authMiddleware.RequireAuth).Get("/me", authHandler.Me)
			auth.With(authMiddleware.RequireAuth).Post("/verify-token", authHandler.VerifyToken)
		})

		api.Route("/users", func(users chi.Router) {
			users.Use(authMiddleware.RequireAuth)
			users.With(appmw.RequireAdmin).Get("/", userHandler.List)
			users.With(appmw.RequireAdmin).Get("/{userID}", userHandler.Get)
			users.With(appmw.RequireAdmin).Post("/", userHandler.Create)
			users.With(appmw.RequireAdmin).Put("/{userID}", userHandler.Update)
			users.With(appmw.RequireAdmin).Delete("/{userID}", userHandler.Delete)
			users.Put("/{userID}/password", userHandler.ChangePassword)
		})

		api.Route("/clusters", func(clusters chi.Router) {
			clusters.Use(authMiddleware.RequireAuth)
			clusters.Get("/", clusterHandler.List)
			clusters.Get("/{clusterID}", clusterHandler.Get)
			clusters.Post("/{clusterID}/test-connection", clusterHandler.TestConnection)
			clusters.With(appmw.RequireAdmin).Post("/", clusterHandler.Create)
			clusters.With(appmw.RequireAdmin).Put("/{clusterID}", clusterHandler.Update)
			clusters.With(appmw.RequireAdmin).Delete("/{clusterID}", clusterHandler.Delete)
			clusters.With(appmw.RequireAdmin).Post("/{clusterID}/activate", clusterHandler.Activate)
		})

		api.Route("/stats", func(stats chi.Router) {
			stats.Use(authMiddleware.RequireAuth)
			stats.Get("/dashboard", statsHandler.Dashboard)
		})

		api.Route("/permissions", func(permissions chi.Router) {
			permissions.Use(authMiddleware.RequireAuth)
			permissions.Use(appmw.RequireAdmin)
			permissions.Get("/users/{userID}", permissionHandler.GetUserPermissions)
			permissions.Post("/users/{userID}/clusters", permissionHandler.GrantClusterPermission)
			permissions.Post("/users/{userID}/namespaces", permissionHandler.GrantNamespacePermission)
			permissions.Put("/clusters/{permissionID}", permissionHandler.UpdateClusterPermission)
			permissions.Put("/namespaces/{permissionID}", permissionHandler.UpdateNamespacePermission)
			permissions.Delete("/clusters/{permissionID}", permissionHandler.RevokeClusterPermission)
			permissions.Delete("/namespaces/{permissionID}", permissionHandler.RevokeNamespacePermission)
		})

		api.Route("/audit-logs", func(audit chi.Router) {
			audit.Use(authMiddleware.RequireAuth)
			audit.Use(appmw.RequireAdmin)
			audit.Get("/", auditLogHandler.List)
			audit.Get("/stats/summary", auditLogHandler.StatsSummary)
		})

		api.Route("/alerts", func(alerts chi.Router) {
			alerts.Use(authMiddleware.RequireAuth)
			alerts.Get("/rules", alertHandler.ListRules)
			alerts.Post("/rules", alertHandler.CreateRule)
			alerts.Get("/rules/{ruleID}", alertHandler.GetRule)
			alerts.Put("/rules/{ruleID}", alertHandler.UpdateRule)
			alerts.Delete("/rules/{ruleID}", alertHandler.DeleteRule)
			alerts.Get("/events", alertHandler.ListEvents)
			alerts.Post("/events/{eventID}/resolve", alertHandler.ResolveEvent)
			alerts.Get("/stats", alertHandler.Stats)
		})

		api.Route("/monitoring", func(monitoring chi.Router) {
			monitoring.Use(authMiddleware.RequireAuth)
			monitoring.Use(appmw.RequireAdmin)
			monitoring.Get("/stats", monitoringHandler.Stats)
		})

		api.Route("/nodes", func(nodes chi.Router) {
			nodes.Use(authMiddleware.RequireAuth)
			nodes.Get("/", nodeHandler.List)
			nodes.Get("/{nodeName}", nodeHandler.Get)
		})

		api.Route("/namespaces", func(namespaces chi.Router) {
			namespaces.Use(authMiddleware.RequireAuth)
			namespaces.Get("/", namespaceHandler.List)
			namespaces.Get("/{namespace}", namespaceHandler.Get)
			namespaces.With(appmw.RequireAdmin).Post("/", namespaceHandler.Create)
			namespaces.With(appmw.RequireAdmin).Delete("/{namespace}", namespaceHandler.Delete)
			namespaces.Get("/{namespace}/resources", namespaceHandler.Resources)
			namespaces.Get("/{namespace}/deployments", namespaceHandler.Deployments)
			namespaces.Get("/{namespace}/services", namespaceHandler.Services)
			namespaces.Get("/{namespace}/crds", namespaceHandler.CRDs)
		})

		api.Route("/pods", func(pods chi.Router) {
			pods.Use(authMiddleware.RequireAuth)
			pods.Get("/", podHandler.List)
			pods.Get("/{namespace}/{podName}", podHandler.Get)
			pods.Get("/{namespace}/{podName}/logs", podHandler.Logs)
			pods.With(appmw.RequireAdmin).Delete("/{namespace}/{podName}", podHandler.Delete)
			pods.With(appmw.RequireAdmin).Post("/batch-delete", podHandler.BatchDelete)
			pods.With(appmw.RequireAdmin).Post("/batch-restart", podHandler.BatchRestart)
		})

		api.Route("/deployments", func(deployments chi.Router) {
			deployments.Use(authMiddleware.RequireAuth)
			deployments.Get("/", deploymentHandler.List)
			deployments.Get("/page", deploymentHandler.ListPage)
			deployments.Get("/{namespace}/{deploymentName}", deploymentHandler.Get)
			deployments.Get("/{namespace}/{deploymentName}/pods", deploymentHandler.Pods)
			deployments.Get("/{namespace}/{deploymentName}/yaml", deploymentHandler.GetYAML)
			deployments.Get("/{namespace}/{deploymentName}/services", deploymentHandler.Services)
			deployments.Get("/{namespace}/{deploymentName}/services/{serviceName}/yaml", deploymentHandler.GetServiceYAML)
			deployments.With(appmw.RequireAdmin).Post("/{namespace}/{deploymentName}/scale", deploymentHandler.Scale)
			deployments.With(appmw.RequireAdmin).Post("/{namespace}/{deploymentName}/restart", deploymentHandler.Restart)
			deployments.With(appmw.RequireAdmin).Delete("/{namespace}/{deploymentName}", deploymentHandler.Delete)
			deployments.With(appmw.RequireAdmin).Put("/{namespace}/{deploymentName}", deploymentHandler.Update)
			deployments.With(appmw.RequireAdmin).Put("/{namespace}/{deploymentName}/yaml", deploymentHandler.UpdateYAML)
			deployments.With(appmw.RequireAdmin).Put("/{namespace}/{deploymentName}/services/{serviceName}/yaml", deploymentHandler.UpdateServiceYAML)
			deployments.With(appmw.RequireAdmin).Delete("/{namespace}/{deploymentName}/services/{serviceName}", deploymentHandler.DeleteService)
		})

		api.Route("/services", func(services chi.Router) {
			services.Use(authMiddleware.RequireAuth)
			services.Get("/", serviceHandler.List)
			services.Get("/page", serviceHandler.ListPage)
			services.Get("/{namespace}/{serviceName}", serviceHandler.Get)
			services.Get("/{namespace}/{serviceName}/yaml", serviceHandler.GetYAML)
			services.With(appmw.RequireAdmin).Post("/", serviceHandler.Create)
			services.With(appmw.RequireAdmin).Put("/{namespace}/{serviceName}", serviceHandler.Update)
			services.With(appmw.RequireAdmin).Put("/{namespace}/{serviceName}/yaml", serviceHandler.UpdateYAML)
			services.With(appmw.RequireAdmin).Delete("/{namespace}/{serviceName}", serviceHandler.Delete)
		})

		api.Route("/configmaps", func(configmaps chi.Router) {
			configmaps.Use(authMiddleware.RequireAuth)
			configmaps.Get("/", configMapHandler.List)
			configmaps.Get("/page", configMapHandler.ListPage)
			configmaps.Get("/{namespace}/{configmapName}", configMapHandler.Get)
			configmaps.Get("/{namespace}/{configmapName}/yaml", configMapHandler.GetYAML)
			configmaps.With(appmw.RequireAdmin).Post("/", configMapHandler.Create)
			configmaps.With(appmw.RequireAdmin).Post("/yaml", configMapHandler.CreateYAML)
			configmaps.With(appmw.RequireAdmin).Put("/{namespace}/{configmapName}", configMapHandler.Update)
			configmaps.With(appmw.RequireAdmin).Put("/{namespace}/{configmapName}/yaml", configMapHandler.UpdateYAML)
			configmaps.With(appmw.RequireAdmin).Delete("/{namespace}/{configmapName}", configMapHandler.Delete)
		})

		api.Route("/secrets", func(secrets chi.Router) {
			secrets.Use(authMiddleware.RequireAuth)
			secrets.Get("/", secretHandler.List)
			secrets.Get("/page", secretHandler.ListPage)
			secrets.Get("/{namespace}/{secretName}", secretHandler.Get)
			secrets.Get("/{namespace}/{secretName}/yaml", secretHandler.GetYAML)
			secrets.With(appmw.RequireAdmin).Post("/", secretHandler.Create)
			secrets.With(appmw.RequireAdmin).Post("/yaml", secretHandler.CreateYAML)
			secrets.With(appmw.RequireAdmin).Put("/{namespace}/{secretName}", secretHandler.Update)
			secrets.With(appmw.RequireAdmin).Put("/{namespace}/{secretName}/yaml", secretHandler.UpdateYAML)
			secrets.With(appmw.RequireAdmin).Delete("/{namespace}/{secretName}", secretHandler.Delete)
		})

		api.Route("/resource-quotas", func(quotas chi.Router) {
			quotas.Use(authMiddleware.RequireAuth)
			quotas.Get("/", resourceQuotaHandler.List)
			quotas.Get("/{namespace}/{quotaName}", resourceQuotaHandler.Get)
			quotas.With(appmw.RequireAdmin).Post("/", resourceQuotaHandler.Create)
			quotas.With(appmw.RequireAdmin).Put("/{namespace}/{quotaName}", resourceQuotaHandler.Update)
			quotas.With(appmw.RequireAdmin).Delete("/{namespace}/{quotaName}", resourceQuotaHandler.Delete)
		})

		api.Route("/network-policies", func(policies chi.Router) {
			policies.Use(authMiddleware.RequireAuth)
			policies.Get("/", networkPolicyHandler.List)
			policies.Get("/{namespace}/{policyName}", networkPolicyHandler.Get)
			policies.With(appmw.RequireAdmin).Post("/", networkPolicyHandler.Create)
			policies.With(appmw.RequireAdmin).Put("/{namespace}/{policyName}", networkPolicyHandler.Update)
			policies.With(appmw.RequireAdmin).Delete("/{namespace}/{policyName}", networkPolicyHandler.Delete)
		})

		api.Route("/events", func(events chi.Router) {
			events.Use(authMiddleware.RequireAuth)
			events.Get("/", eventHandler.List)
		})

		api.Route("/jobs", func(jobs chi.Router) {
			jobs.Use(authMiddleware.RequireAuth)

			jobs.Get("/templates", jobHandler.ListTemplates)
			jobs.Post("/templates", jobHandler.CreateTemplate)
			jobs.Get("/templates/{templateID}", jobHandler.GetTemplate)
			jobs.Put("/templates/{templateID}", jobHandler.UpdateTemplate)
			jobs.Delete("/templates/{templateID}", jobHandler.DeleteTemplate)

			jobs.Get("/history", jobHandler.ListHistory)
			jobs.Post("/history/{historyID}/status", jobHandler.UpdateHistoryStatus)
			jobs.Post("/monitor/{historyID}", jobHandler.MonitorJobStatus)

			jobs.Get("/{clusterID}/namespaces/{namespace}/jobs", jobHandler.ListJobs)
			jobs.Post("/{clusterID}/namespaces/{namespace}/jobs", jobHandler.CreateJob)
			jobs.Get("/{clusterID}/namespaces/{namespace}/jobs/{jobName}", jobHandler.GetJob)
			jobs.Delete("/{clusterID}/namespaces/{namespace}/jobs/{jobName}", jobHandler.DeleteJob)
			jobs.Post("/{clusterID}/namespaces/{namespace}/jobs/{jobName}/restart", jobHandler.RestartJob)
			jobs.Get("/{clusterID}/namespaces/{namespace}/jobs/{jobName}/pods", jobHandler.GetJobPods)
			jobs.Get("/{clusterID}/namespaces/{namespace}/jobs/{jobName}/yaml", jobHandler.GetJobYAML)
			jobs.Put("/{clusterID}/namespaces/{namespace}/jobs/{jobName}/yaml", jobHandler.UpdateJobYAML)

			jobs.Post("/{clusterID}/namespaces/{namespace}/jobs/bulk-delete", jobHandler.BulkDeleteJobs)
			jobs.Get("/{clusterID}/namespaces/{namespace}/jobs/status", jobHandler.GetJobsStatusOverview)
		})

		api.Route("/storage", func(storage chi.Router) {
			storage.Use(authMiddleware.RequireAuth)
			storage.Get("/classes", storageHandler.ListStorageClasses)
			storage.With(appmw.RequireAdmin).Post("/classes", storageHandler.CreateStorageClass)
			storage.With(appmw.RequireAdmin).Delete("/classes/{scName}", storageHandler.DeleteStorageClass)

			storage.Get("/volumes", storageHandler.ListPersistentVolumes)
			storage.Get("/volumes/{pvName}", storageHandler.GetPersistentVolume)
			storage.With(appmw.RequireAdmin).Post("/volumes", storageHandler.CreatePersistentVolume)
			storage.With(appmw.RequireAdmin).Delete("/volumes/{pvName}", storageHandler.DeletePersistentVolume)
			storage.Get("/volumes/{pvName}/files", storageHandler.BrowseVolumeFiles)
			storage.Get("/volumes/{pvName}/files/content", storageHandler.ReadVolumeFile)

			storage.Get("/claims", storageHandler.ListPersistentVolumeClaims)
			storage.Get("/claims/{namespace}/{pvcName}", storageHandler.GetPersistentVolumeClaim)
			storage.With(appmw.RequireAdmin).Post("/claims", storageHandler.CreatePersistentVolumeClaim)
			storage.With(appmw.RequireAdmin).Delete("/claims/{namespace}/{pvcName}", storageHandler.DeletePersistentVolumeClaim)
		})

		api.Route("/rbac", func(rbac chi.Router) {
			rbac.Use(authMiddleware.RequireAuth)
			rbac.Use(appmw.RequireAdmin)
			rbac.Get("/roles", rbacHandler.ListRoles)
			rbac.Get("/roles/{namespace}/{name}", rbacHandler.GetRole)
			rbac.Delete("/roles/{namespace}/{name}", rbacHandler.DeleteRole)

			rbac.Get("/role-bindings", rbacHandler.ListRoleBindings)
			rbac.Get("/role-bindings/{namespace}/{name}", rbacHandler.GetRoleBinding)
			rbac.Delete("/role-bindings/{namespace}/{name}", rbacHandler.DeleteRoleBinding)

			rbac.Get("/service-accounts", rbacHandler.ListServiceAccounts)
			rbac.Get("/service-accounts/{namespace}/{name}", rbacHandler.GetServiceAccount)
			rbac.Delete("/service-accounts/{namespace}/{name}", rbacHandler.DeleteServiceAccount)

			rbac.Get("/cluster-roles", rbacHandler.ListClusterRoles)
			rbac.Get("/cluster-role-bindings", rbacHandler.ListClusterRoleBindings)
		})

		api.Route("/metrics", func(metrics chi.Router) {
			metrics.Use(authMiddleware.RequireAuth)
			metrics.Get("/clusters/{clusterID}/metrics/health", metricsHandler.CheckHealth)
			metrics.Get("/clusters/{clusterID}/metrics", metricsHandler.ClusterMetrics)
			metrics.Get("/clusters/{clusterID}/nodes/metrics", metricsHandler.NodeMetrics)
			metrics.With(appmw.RequireAdmin).Post("/clusters/{clusterID}/metrics-server/install", metricsHandler.InstallMetricsServer)
		})

		api.Route("/cronjobs", func(cronjobs chi.Router) {
			cronjobs.Use(authMiddleware.RequireAuth)
			cronjobs.Get("/clusters/{clusterID}/namespaces/{namespace}/cronjobs", workloadHandler.ListCronJobs)
			cronjobs.Get("/clusters/{clusterID}/namespaces/{namespace}/cronjobs/{name}", workloadHandler.GetCronJob)
			cronjobs.With(appmw.RequireAdmin).Delete("/clusters/{clusterID}/namespaces/{namespace}/cronjobs/{name}", workloadHandler.DeleteCronJob)
		})

		api.Route("/daemonsets", func(daemonsets chi.Router) {
			daemonsets.Use(authMiddleware.RequireAuth)
			daemonsets.Get("/clusters/{clusterID}/namespaces/{namespace}/daemonsets", workloadHandler.ListDaemonSets)
			daemonsets.Get("/clusters/{clusterID}/namespaces/{namespace}/daemonsets/{name}", workloadHandler.GetDaemonSet)
			daemonsets.With(appmw.RequireAdmin).Delete("/clusters/{clusterID}/namespaces/{namespace}/daemonsets/{name}", workloadHandler.DeleteDaemonSet)
		})

		api.Route("/statefulsets", func(statefulsets chi.Router) {
			statefulsets.Use(authMiddleware.RequireAuth)
			statefulsets.Get("/clusters/{clusterID}/namespaces/{namespace}/statefulsets", workloadHandler.ListStatefulSets)
			statefulsets.Get("/clusters/{clusterID}/namespaces/{namespace}/statefulsets/{name}", workloadHandler.GetStatefulSet)
			statefulsets.With(appmw.RequireAdmin).Post("/clusters/{clusterID}/namespaces/{namespace}/statefulsets/{name}/scale", workloadHandler.ScaleStatefulSet)
			statefulsets.With(appmw.RequireAdmin).Delete("/clusters/{clusterID}/namespaces/{namespace}/statefulsets/{name}", workloadHandler.DeleteStatefulSet)
		})

		api.Route("/hpas", func(hpas chi.Router) {
			hpas.Use(authMiddleware.RequireAuth)
			hpas.Get("/clusters/{clusterID}/namespaces/{namespace}/hpas", workloadHandler.ListHPAs)
			hpas.Get("/clusters/{clusterID}/namespaces/{namespace}/hpas/{name}", workloadHandler.GetHPA)
			hpas.With(appmw.RequireAdmin).Delete("/clusters/{clusterID}/namespaces/{namespace}/hpas/{name}", workloadHandler.DeleteHPA)
		})

		api.Route("/ingresses", func(ingresses chi.Router) {
			ingresses.Use(authMiddleware.RequireAuth)
			ingresses.Get("/clusters/{clusterID}/namespaces/{namespace}/ingresses", workloadHandler.ListIngresses)
			ingresses.Get("/clusters/{clusterID}/namespaces/{namespace}/ingresses/{name}", workloadHandler.GetIngress)
			ingresses.With(appmw.RequireAdmin).Delete("/clusters/{clusterID}/namespaces/{namespace}/ingresses/{name}", workloadHandler.DeleteIngress)
		})

		api.Route("/ws", func(ws chi.Router) {
			ws.Use(authMiddleware.RequireAuth)
			ws.Get("/", websocketHandler.Connect)
			ws.Get("/stats", websocketHandler.Stats)
		})
	})

	return r
}
