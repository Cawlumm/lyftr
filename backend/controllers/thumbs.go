package controllers

import (
	"context"
	"errors"
	"log"
	"net/http"

	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/gin-gonic/gin"
)

// ExerciseThumb serves a small copy of an exercise's oedb image (stores.ThumbStore).
//
// Public on purpose: the app renders it with <img> on web and <Image> on native, neither of
// which sends the bearer token. It serves only images of exercises this server holds, which
// are public oedb images anyway. An oedb image id is a content id that oedb itself serves as
// immutable, so the thumbnail is too.
func (h *Handler) ExerciseThumb(c *gin.Context) {
	if h.s.Thumbs == nil {
		c.Status(http.StatusNotFound)
		return
	}
	path, err := h.s.Thumbs.Path(c.Request.Context(), c.Param("id"))
	switch {
	case err == nil:
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.File(path)
	case errors.Is(err, context.Canceled):
		// The client scrolled past the row; nobody is waiting for an answer.
		c.Status(499)
	case errors.Is(err, stores.ErrThumbUnknown):
		c.Status(http.StatusNotFound)
	case errors.Is(err, stores.ErrThumbUpstream):
		log.Printf("exercise thumb %s: %v", c.Param("id"), err)
		// Not cached: the next request should try oedb again.
		c.Header("Cache-Control", "no-store")
		c.Status(http.StatusBadGateway)
	default:
		log.Printf("exercise thumb %s: %v", c.Param("id"), err)
		c.Header("Cache-Control", "no-store")
		c.Status(http.StatusInternalServerError)
	}
}
