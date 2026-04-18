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
	jwt.RegisteredClaims
}

func GenerateTokenPair(userID int64, email string) (access, refresh string, err error) {
	expiry, _ := strconv.Atoi(config.C.JWTExpiry)
	if expiry == 0 {
		expiry = 3600
	}

	access, err = generateToken(userID, email, "access", time.Duration(expiry)*time.Second)
	if err != nil {
		return
	}
	refresh, err = generateToken(userID, email, "refresh", 30*24*time.Hour)
	return
}

func generateToken(userID int64, email, tokenType string, dur time.Duration) (string, error) {
	claims := Claims{
		UserID: userID,
		Email:  email,
		Type:   tokenType,
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
