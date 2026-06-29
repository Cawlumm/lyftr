package controllers

import "github.com/Cawlumm/lyftr-backend/stores"

// Handler carries the injected stores. Every HTTP handler is a method on Handler
// so it reaches the database only through h.s.<Entity>, never the global db.DB.
type Handler struct {
	s *stores.Stores
}

func NewHandler(s *stores.Stores) *Handler { return &Handler{s: s} }
