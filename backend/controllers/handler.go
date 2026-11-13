package controllers

import (
	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/stores"
)

// Handler carries the injected stores. Every HTTP handler is a method on Handler
// so it reaches the database only through h.s.<Entity>, never the global db.DB.
type Handler struct {
	s *stores.Stores
	// loginByEmail caps password guesses against one account however many addresses they
	// come from; the per-address limit in front of the route cannot see a distributed
	// attack. It is a ceiling, loose enough that one caller cannot hold a victim out
	// with a trickle: 20 at once, then 20 a minute. Only failures count; a good login
	// refunds its token.
	loginByEmail *middleware.Limiter
	// loginByPair is the strict one, keyed on address plus email: 5 at once, then 5 a
	// minute. A guesser is stopped here long before the account-wide ceiling, and
	// the owner, coming from a different address, never shares it.
	loginByPair *middleware.Limiter
}

func NewHandler(s *stores.Stores) *Handler {
	return &Handler{
		s:            s,
		loginByEmail: middleware.NewLimiter(20, 20, 10000),
		loginByPair:  middleware.NewLimiter(5, 5, 10000),
	}
}

// TokenVersions is the handler's user store as the auth middleware needs it, so routes can
// wire Auth without reaching into the stores.
// Admins is the handler's user store as AdminOnly needs it.
func (h *Handler) Admins() middleware.Admins { return h.s.User }

func (h *Handler) TokenVersions() middleware.TokenVersions { return h.s.User }
