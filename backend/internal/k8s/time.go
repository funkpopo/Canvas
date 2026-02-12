package k8s

import (
	"fmt"
	"time"
)

func CalculateAge(ts *time.Time) string {
	if ts == nil {
		return "unknown"
	}
	return CalculateAgeFromTime(*ts)
}

func CalculateAgeFromTime(ts time.Time) string {
	now := time.Now().UTC()
	if ts.After(now) {
		return "0s"
	}
	d := now.Sub(ts)

	switch {
	case d.Hours() >= 24*365:
		return fmt.Sprintf("%dy", int(d.Hours()/(24*365)))
	case d.Hours() >= 24*30:
		return fmt.Sprintf("%dmo", int(d.Hours()/(24*30)))
	case d.Hours() >= 24:
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	case d.Hours() >= 1:
		return fmt.Sprintf("%dh", int(d.Hours()))
	case d.Minutes() >= 1:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	default:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
}
