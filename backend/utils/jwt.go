package utils

import (
	"crypto/rand"
	"encoding/hex"
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
	// TokenVersion is the users.token_version this token was minted against. Refresh and
	// the auth middleware both reject a mismatch, which is what makes a password or email
	// change actually end other sessions. Absent in tokens issued before the claim existed,
	// so it decodes as 0 there — see NormalizeTokenVersion.
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

	access, err = generateToken(userID, email, "access", tokenVersion, time.Duration(expiry)*time.Second, "")
	if err != nil {
		return
	}
	refresh, err = generateToken(userID, email, "refresh", tokenVersion, 30*24*time.Hour, "")
	return
}

// RefreshGrace is how long a refresh token that has already been rotated may be presented
// again and still be served rather than treated as theft. It covers the one honest cause of
// a repeat, a response lost after the server committed (a dropped connection, a client
// killed mid-write), and nothing a thief could use at leisure. It is minutes, not seconds:
// the client's request timeout is 20s, and an app killed or offline between the server's
// commit and its own storage write only retries when it is reopened, which takes longer
// than the few seconds that would be left. Reuse past it signs every device out.
const RefreshGrace = 10 * time.Minute

// SessionTokens is a freshly minted pair plus what the server must remember about the
// refresh half.
type SessionTokens struct {
	Access, Refresh string
	RefreshID       string
	RefreshExpires  time.Time
}

// GenerateSession is GenerateTokenPair with a jti on the refresh token, for the server to
// store. GenerateTokenPair still mints the pre-jti shape, which is what tokens already in
// the wild look like and what the legacy-token tests exercise.
func GenerateSession(userID int64, email string, tokenVersion int) (SessionTokens, error) {
	expiry, _ := strconv.Atoi(config.C.JWTExpiry)
	if expiry == 0 {
		expiry = 3600
	}
	access, err := generateToken(userID, email, "access", tokenVersion, time.Duration(expiry)*time.Second, "")
	if err != nil {
		return SessionTokens{}, err
	}
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return SessionTokens{}, err
	}
	id := hex.EncodeToString(raw)
	const life = 30 * 24 * time.Hour
	refresh, err := generateToken(userID, email, "refresh", tokenVersion, life, id)
	if err != nil {
		return SessionTokens{}, err
	}
	return SessionTokens{Access: access, Refresh: refresh, RefreshID: id, RefreshExpires: time.Now().Add(life)}, nil
}

func generateToken(userID int64, email, tokenType string, tokenVersion int, dur time.Duration, jti string) (string, error) {
	claims := Claims{
		UserID:       userID,
		Email:        email,
		Type:         tokenType,
		TokenVersion: NormalizeTokenVersion(tokenVersion),
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        jti,
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
