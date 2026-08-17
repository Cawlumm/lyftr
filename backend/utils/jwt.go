package utils

import (
	"errors"
	"strconv"
	"time"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID int64  `json:"user_id"`
	Email  string `json:"email"`
	Type   string `json:"type"` // "access" or "refresh"
	// TokenVersion is the users.token_version this token was minted against. Refresh
	// rejects a mismatch, which is what makes a password change actually end other
	// sessions. Absent in tokens issued before the claim existed, so it decodes as 0
	// there — see NormalizeTokenVersion.
	TokenVersion int `json:"ver,omitempty"`
	jwt.RegisteredClaims
}

// NormalizeTokenVersion maps a token's version onto the same scale as the stored
// column. Tokens minted before the "ver" claim existed decode as 0; accounts have
// always started at 1. Folding 0 up to 1 keeps everyone signed in across the upgrade
// while still invalidating those legacy tokens the moment a password change moves the
// account to 2.
func NormalizeTokenVersion(v int) int {
	if v < 1 {
		return 1
	}
	return v
}

func GenerateTokenPair(userID int64, email string, tokenVersion int) (access, refresh string, err error) {
	expiry, _ := strconv.Atoi(config.C.JWTExpiry)
	if expiry == 0 {
		expiry = 3600
	}

	access, err = generateToken(userID, email, "access", tokenVersion, time.Duration(expiry)*time.Second)
	if err != nil {
		return
	}
	refresh, err = generateToken(userID, email, "refresh", tokenVersion, 30*24*time.Hour)
	return
}

func generateToken(userID int64, email, tokenType string, tokenVersion int, dur time.Duration) (string, error) {
	claims := Claims{
		UserID:       userID,
		Email:        email,
		Type:         tokenType,
		TokenVersion: NormalizeTokenVersion(tokenVersion),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(dur)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(config.C.JWTSecret))
}

func ValidateToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(config.C.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}
