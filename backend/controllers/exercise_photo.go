package controllers

import (
	"errors"
	"io"
	"net/http"

	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

// photoFailure maps a photo store error to its response, reporting whether it wrote one.
func photoFailure(c *gin.Context, err error) bool {
	switch {
	case errors.Is(err, stores.ErrPhotoInvalid):
		utils.Fail(c, utils.CodePhotoInvalid, nil)
		return true
	case errors.Is(err, stores.ErrPhotoTooLarge):
		utils.Fail(c, utils.CodePhotoTooLarge, nil)
		return true
	}
	return customExerciseFailure(c, err, "")
}

// UploadExercisePhoto takes one photo for the caller's own custom exercise, multipart field
// "photo". The part's Content-Type is ignored: the store decides by decoding.
func (h *Handler) UploadExercisePhoto(c *gin.Context) {
	id, ok := exerciseIDParam(c)
	if !ok {
		return
	}
	uid := middleware.UserID(c)
	// Ownership first, so a catalog row answers 403 and another user's 404 whatever was sent.
	if err := h.s.Exercise.CheckOwned(uid, id); customExerciseFailure(c, err, "") {
		return
	}
	// The route's body cap (middleware) answers with a MaxBytesError; the file read below is
	// bounded again so the limit holds wherever the handler is mounted.
	if err := c.Request.ParseMultipartForm(stores.MaxPhotoBytes + 1<<20); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			utils.Fail(c, utils.CodePhotoTooLarge, nil)
		} else {
			utils.Fail(c, utils.CodePhotoInvalid, nil)
		}
		return
	}
	file, _, err := c.Request.FormFile("photo")
	if err != nil {
		utils.Fail(c, utils.CodePhotoInvalid, nil)
		return
	}
	defer file.Close()
	src, err := io.ReadAll(io.LimitReader(file, stores.MaxPhotoBytes+1))
	if err != nil {
		utils.Fail(c, utils.CodePhotoInvalid, nil)
		return
	}
	if len(src) > stores.MaxPhotoBytes {
		utils.Fail(c, utils.CodePhotoTooLarge, nil)
		return
	}
	e, err := h.s.Exercise.SetPhoto(uid, id, src)
	if photoFailure(c, err) {
		return
	}
	utils.OK(c, e)
}

// DeleteExercisePhoto removes the photo; it is idempotent.
func (h *Handler) DeleteExercisePhoto(c *gin.Context) {
	id, ok := exerciseIDParam(c)
	if !ok {
		return
	}
	e, err := h.s.Exercise.ClearPhoto(middleware.UserID(c), id)
	if customExerciseFailure(c, err, "") {
		return
	}
	utils.OK(c, e)
}

// GetExercisePhoto serves the caller's own photo as JPEG: ?size=thumb for the list tile,
// full otherwise. The URL is immutable only when ?v names the current photo_id, so a client
// holding a stale id revalidates instead of being pinned to the old picture.
func (h *Handler) GetExercisePhoto(c *gin.Context) {
	id, ok := exerciseIDParam(c)
	if !ok {
		return
	}
	path, photoID, err := h.s.Exercise.PhotoFile(middleware.UserID(c), id, c.Query("size") == "thumb")
	switch {
	case errors.Is(err, stores.ErrExerciseNotFound), errors.Is(err, stores.ErrNoPhoto):
		utils.Fail(c, utils.CodeExerciseNotFound, nil)
		return
	case utils.DBError(c, err):
		return
	}
	if c.Query("v") == photoID {
		c.Header("Cache-Control", "private, max-age=31536000, immutable")
	} else {
		c.Header("Cache-Control", "private, no-cache")
	}
	c.Header("Content-Type", "image/jpeg")
	c.File(path)
}
