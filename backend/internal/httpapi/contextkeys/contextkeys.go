package contextkeys

type key string

const (
	RequestIDKey key = "request_id"
	CurrentUser  key = "current_user"
)
