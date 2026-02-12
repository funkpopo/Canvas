package security

import (
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"strconv"
	"strings"

	"golang.org/x/crypto/bcrypt"
	"golang.org/x/crypto/scrypt"
)

func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func VerifyPassword(password string, encoded string) bool {
	switch {
	case strings.HasPrefix(encoded, "$2a$"), strings.HasPrefix(encoded, "$2b$"), strings.HasPrefix(encoded, "$2y$"):
		return bcrypt.CompareHashAndPassword([]byte(encoded), []byte(password)) == nil
	case strings.HasPrefix(encoded, "$scrypt$"):
		ok, err := verifyPasslibScrypt(password, encoded)
		return err == nil && ok
	default:
		return false
	}
}

func verifyPasslibScrypt(password string, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 5 || parts[1] != "scrypt" {
		return false, errors.New("invalid scrypt hash format")
	}

	params, err := parseScryptParams(parts[2])
	if err != nil {
		return false, err
	}

	salt, err := decodeRawBase64(parts[3])
	if err != nil {
		return false, err
	}

	expected, err := decodeRawBase64(parts[4])
	if err != nil {
		return false, err
	}

	derived, err := scrypt.Key([]byte(password), salt, params.N, params.R, params.P, len(expected))
	if err != nil {
		return false, err
	}

	return subtle.ConstantTimeCompare(derived, expected) == 1, nil
}

type scryptParams struct {
	N int
	R int
	P int
}

func parseScryptParams(raw string) (scryptParams, error) {
	params := scryptParams{}
	items := strings.Split(raw, ",")
	for _, item := range items {
		kv := strings.SplitN(strings.TrimSpace(item), "=", 2)
		if len(kv) != 2 {
			continue
		}
		value, err := strconv.Atoi(kv[1])
		if err != nil {
			return scryptParams{}, err
		}
		switch kv[0] {
		case "ln":
			params.N = 1 << value
		case "r":
			params.R = value
		case "p":
			params.P = value
		}
	}
	if params.N == 0 || params.R == 0 || params.P == 0 {
		return scryptParams{}, errors.New("missing scrypt parameters")
	}
	return params, nil
}

func decodeRawBase64(raw string) ([]byte, error) {
	decoded, err := base64.RawStdEncoding.DecodeString(raw)
	if err == nil {
		return decoded, nil
	}

	// Fallback for non-raw input.
	padding := len(raw) % 4
	if padding != 0 {
		raw += strings.Repeat("=", 4-padding)
	}
	return base64.StdEncoding.DecodeString(raw)
}
