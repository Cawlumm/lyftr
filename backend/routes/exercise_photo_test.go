package routes

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The 10 MB route cap answers PHOTO_TOO_LARGE rather than the generic BODY_TOO_LARGE, and an
// upload over the 1 MB default but under the cap gets past the body limit.
func TestPhotoUpload_RouteBodyCap(t *testing.T) {
	a := newAPI(t)
	access, _ := a.register("photo@example.com")
	code, body := a.do("POST", "/api/v1/exercises", access, map[string]any{"name": "Sled Push", "muscle_group": "chest"})
	if code != http.StatusCreated {
		t.Fatalf("create = %d %v", code, body)
	}
	id := int64(data(body)["id"].(float64))

	put := func(size int) (int, map[string]any) {
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		part, _ := mw.CreateFormFile("photo", "p.jpg")
		part.Write(make([]byte, size))
		mw.Close()
		req := httptest.NewRequest("PUT", fmt.Sprintf("/api/v1/exercises/%d/photo", id), &buf)
		req.Header.Set("Content-Type", mw.FormDataContentType())
		req.Header.Set("Authorization", "Bearer "+access)
		w := httptest.NewRecorder()
		a.r.ServeHTTP(w, req)
		var out map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		return w.Code, out
	}
	if code, out := put(11 << 20); code != http.StatusRequestEntityTooLarge || out["code"] != "PHOTO_TOO_LARGE" {
		t.Errorf("11 MB = %d %v, want 413 PHOTO_TOO_LARGE", code, out)
	}
	// 2 MB of zeros is not an image: it reached the decoder, so the body cap let it through.
	if code, out := put(2 << 20); code != http.StatusUnprocessableEntity || out["code"] != "PHOTO_INVALID" {
		t.Errorf("2 MB junk = %d %v, want 422 PHOTO_INVALID", code, out)
	}
}
