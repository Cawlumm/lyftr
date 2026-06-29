package utils

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func Created(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

func BadRequest(c *gin.Context, msg string) {
	c.JSON(http.StatusBadRequest, gin.H{"error": msg})
}

func Unauthorized(c *gin.Context, msg string) {
	c.JSON(http.StatusUnauthorized, gin.H{"error": msg})
}

func NotFound(c *gin.Context, msg string) {
	c.JSON(http.StatusNotFound, gin.H{"error": msg})
}

func InternalError(c *gin.Context) {
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
}

func ValidationError(c *gin.Context, err error) {
	c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
}

func Conflict(c *gin.Context, msg string) {
	c.JSON(http.StatusConflict, gin.H{"error": msg})
}

// ServiceUnavailable signals a transient failure the client may retry, such as
// a busy/locked database.
func ServiceUnavailable(c *gin.Context, msg string) {
	c.Header("Retry-After", "2")
	c.JSON(http.StatusServiceUnavailable, gin.H{"error": msg})
}
