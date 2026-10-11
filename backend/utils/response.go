package utils

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func Created(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

// write is the one place an error body is built: the sentence in `error`, the stable id in
// `code`, and `params` only when the sentence has variables.
func write(c *gin.Context, code Code, msg string, params map[string]any) {
	if code.Status == http.StatusServiceUnavailable {
		c.Header("Retry-After", "2")
	}
	body := gin.H{"error": msg, "code": code.ID}
	if len(params) > 0 {
		body["params"] = params
	}
	c.JSON(code.Status, body)
}

// Fail answers with a registered code and its English sentence.
func Fail(c *gin.Context, code Code, params map[string]any) {
	write(c, code, code.Message(params), params)
}

func InternalError(c *gin.Context) {
	Fail(c, CodeInternalError, nil)
}

// fieldFailure answers a request whose fields broke a rule. The message is built by
// describe rather than taken from err.Error(), which is a Go struct dump.
func fieldFailure(c *gin.Context, code Code, err error) {
	var fieldErrs validator.ValidationErrors
	if !errors.As(err, &fieldErrs) || len(fieldErrs) == 0 {
		Fail(c, code, nil)
		return
	}
	msg, violations := describe(err)
	write(c, code, msg, map[string]any{"violations": violations})
}

// ValidationError reports a request whose fields broke a rule (422).
func ValidationError(c *gin.Context, err error) {
	fieldFailure(c, CodeValidationFailed, err)
}

// BindError reports a request body that could not be bound: undecodable JSON (400 with a
// code per kind of failure) or, for `binding` tags, broken field rules (400 INVALID_FIELDS).
func BindError(c *gin.Context, err error) {
	var fe validator.ValidationErrors
	if errors.As(err, &fe) {
		fieldFailure(c, codeInvalidFields, err)
		return
	}
	code, params := bindFailure(err)
	Fail(c, code, params)
}
