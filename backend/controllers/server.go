package controllers

import (
	"log"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

// ServerInfo is a public, unauthenticated endpoint clients use to verify that a
// configured server URL is reachable and is actually a Lyftr backend — the
// "test connection" behind the in-app server selector. It runs under the same
// CORS policy as the rest of the API, so a successful probe honestly predicts
// that authenticated requests from the same origin will be allowed too.
//
// registration_open lets the clients hide the "Create account" affordance instead of
// offering a link that 403s on submit. It is politeness, not enforcement — the check in
// Register is what actually closes the door — and only the boolean is exposed, never the
// mode, so a scanner learns nothing it could not learn by POSTing once.
func (h *Handler) ServerInfo(c *gin.Context) {
	open, err := h.registrationOpen()
	if err != nil {
		log.Printf("server info: could not determine registration state, reporting closed: %v", err)
	}
	utils.OK(c, gin.H{
		"name":              "lyftr",
		"version":           config.C.Version,
		"registration_open": open,
	})
}
