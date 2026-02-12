package handlers

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

func mapStringAnyToStringMap(input map[string]interface{}) map[string]string {
	if len(input) == 0 {
		return map[string]string{}
	}
	out := make(map[string]string, len(input))
	for key, value := range input {
		out[strings.TrimSpace(key)] = fmt.Sprint(value)
	}
	return out
}

func mapStringStringClone(input map[string]string) map[string]string {
	if len(input) == 0 {
		return map[string]string{}
	}
	out := make(map[string]string, len(input))
	for key, value := range input {
		out[key] = value
	}
	return out
}

func convertViaJSON(src interface{}, dst interface{}) error {
	payload, err := json.Marshal(src)
	if err != nil {
		return err
	}
	return json.Unmarshal(payload, dst)
}

func formatTimePtrRFC3339(t *time.Time) *string {
	if t == nil || t.IsZero() {
		return nil
	}
	value := t.UTC().Format(time.RFC3339)
	return &value
}

func formatTimeRFC3339(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func parsePathUintParam(raw string) (uint, error) {
	parsed, err := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(parsed), nil
}

func mapInterfaceSlice(v interface{}) []map[string]interface{} {
	if v == nil {
		return []map[string]interface{}{}
	}
	raw, ok := v.([]interface{})
	if !ok {
		return []map[string]interface{}{}
	}
	items := make([]map[string]interface{}, 0, len(raw))
	for _, item := range raw {
		if obj, ok := item.(map[string]interface{}); ok {
			items = append(items, obj)
		}
	}
	return items
}
