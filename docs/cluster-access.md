# Kubernetes Cluster Access

## API Endpoint
- TBD: Provide cluster API server URL

## Authentication
- TBD: Choose authentication method (kubeconfig path, service account token, OIDC)
- Notes: Document token rotation or credential refresh requirements

## RBAC Scope
- TBD: List service accounts/namespaces with required permissions
- TBD: Outline minimum roles required for read-only dashboard access

## Networking
- TBD: Mention VPN or bastion requirements
- TBD: Provide proxy settings if access goes through an HTTP proxy

## Next Steps
- [ ] Populate the above fields before connecting backend services
- [ ] Store sensitive values in `.env` files or secrets manager, not in source control
