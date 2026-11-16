package controllers

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/gin-gonic/gin"
)

func photoDir() string { return filepath.Dir(th.s.Photos.Path(strings.Repeat("a", 32), false)) }

func photoFiles(t *testing.T) []string {
	t.Helper()
	entries, _ := os.ReadDir(photoDir())
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	return names
}

func testJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y += 7 {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{uint8(x), uint8(y), 90, 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// withEXIF inserts an APP1 Exif segment carrying a fake GPS tag right after the SOI marker.
func withEXIF(jpg []byte) []byte {
	payload := append([]byte("Exif\x00\x00"), []byte("GPSLatitude=51.5 GPSLongitude=-0.12")...)
	seg := []byte{0xFF, 0xE1, byte((len(payload) + 2) >> 8), byte(len(payload) + 2)}
	out := append([]byte{}, jpg[:2]...)
	out = append(out, seg...)
	out = append(out, payload...)
	return append(out, jpg[2:]...)
}

func uploadPhoto(t *testing.T, uid, exID int64, file []byte, contentType string) (int, map[string]any) {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	if file != nil {
		part, err := mw.CreatePart(map[string][]string{
			"Content-Disposition": {`form-data; name="photo"; filename="p"`},
			"Content-Type":        {contentType},
		})
		if err != nil {
			t.Fatal(err)
		}
		part.Write(file)
	}
	mw.Close()
	c, w := newContext(uid, http.MethodPut, fmt.Sprintf("/api/v1/exercises/%d/photo", exID), nil)
	c.Request.Body = http.NoBody
	c.Request, _ = http.NewRequest(http.MethodPut, c.Request.URL.String(), &body)
	c.Request.Header.Set("Content-Type", mw.FormDataContentType())
	setParam(c, "id", fmt.Sprint(exID))
	th.UploadExercisePhoto(c)
	return w.Code, decodeResponse(t, w)
}

func photoRequest(uid, exID int64, method, query string, h gin.HandlerFunc) *httptest.ResponseRecorder {
	c, w := newContext(uid, method, fmt.Sprintf("/api/v1/exercises/%d/photo%s", exID, query), nil)
	setParam(c, "id", fmt.Sprint(exID))
	h(c)
	return w
}

func newCustomID(t *testing.T, uid int64, name string) int64 {
	t.Helper()
	code, resp := createCustom(t, uid, map[string]any{"name": name, "muscle_group": "chest"})
	if code != http.StatusCreated {
		t.Fatalf("create: %d %v", code, resp)
	}
	return idOf(t, resp)
}

func photoIDOf(resp map[string]any) string {
	s, _ := resp["data"].(map[string]any)["photo_id"].(string)
	return s
}

func TestUploadPhoto_StoresJPEGWithoutEXIF(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := newCustomID(t, uid, "Sled Push")
	src := withEXIF(testJPEG(t, 2000, 1000))
	if !bytes.Contains(src, []byte("GPSLatitude")) {
		t.Fatal("fixture has no EXIF")
	}
	// The part's Content-Type is a lie; the bytes decide.
	code, resp := uploadPhoto(t, uid, ex, src, "text/plain")
	if code != http.StatusOK {
		t.Fatalf("status %d: %v", code, resp)
	}
	id := photoIDOf(resp)
	if len(id) != 32 {
		t.Fatalf("photo_id = %q", id)
	}
	stored, err := os.ReadFile(th.s.Photos.Path(id, false))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(stored, []byte("Exif")) || bytes.Contains(stored, []byte("GPS")) || bytes.Contains(stored, []byte{0xFF, 0xE1}) {
		t.Error("stored photo still carries EXIF/APP1")
	}
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(stored))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Width != 1600 || cfg.Height != 800 {
		t.Errorf("stored size %dx%d, want 1600x800", cfg.Width, cfg.Height)
	}
	thumb, err := os.ReadFile(th.s.Photos.Path(id, true))
	if err != nil {
		t.Fatal(err)
	}
	tc, err := jpeg.DecodeConfig(bytes.NewReader(thumb))
	if err != nil || min(tc.Width, tc.Height) != 192 {
		t.Errorf("thumb %v %v, want short side 192", tc, err)
	}
}

func TestUploadPhoto_NeverScalesUpAndAcceptsPNG(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := newCustomID(t, uid, "Sled Push")
	img := image.NewNRGBA(image.Rect(0, 0, 300, 200)) // fully transparent
	var buf bytes.Buffer
	png.Encode(&buf, img)
	code, resp := uploadPhoto(t, uid, ex, buf.Bytes(), "image/png")
	if code != http.StatusOK {
		t.Fatalf("status %d: %v", code, resp)
	}
	stored, _ := os.ReadFile(th.s.Photos.Path(photoIDOf(resp), false))
	decoded, err := jpeg.Decode(bytes.NewReader(stored))
	if err != nil || decoded.Bounds().Dx() != 300 || decoded.Bounds().Dy() != 200 {
		t.Fatalf("decoded %v %v", decoded, err)
	}
	if r, g, b, _ := decoded.At(10, 10).RGBA(); r>>8 < 250 || g>>8 < 250 || b>>8 < 250 {
		t.Errorf("transparent pixel flattened to %d %d %d, want white", r>>8, g>>8, b>>8)
	}
}

func TestUploadPhoto_RejectsNonImage(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := newCustomID(t, uid, "Sled Push")
	code, resp := uploadPhoto(t, uid, ex, []byte("definitely not a photo"), "image/jpeg")
	if code != http.StatusUnprocessableEntity || resp["code"] != "PHOTO_INVALID" {
		t.Errorf("%d %v", code, resp)
	}
	code, resp = uploadPhoto(t, uid, ex, nil, "")
	if code != http.StatusUnprocessableEntity || resp["code"] != "PHOTO_INVALID" {
		t.Errorf("missing field: %d %v", code, resp)
	}
	if n := len(photoFiles(t)); n != 0 {
		t.Errorf("%d files left behind", n)
	}
}

func TestUploadPhoto_RejectsOversizedFile(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := newCustomID(t, uid, "Sled Push")
	big := append(testJPEG(t, 100, 100), make([]byte, 10<<20)...)
	code, resp := uploadPhoto(t, uid, ex, big, "image/jpeg")
	if code != http.StatusRequestEntityTooLarge || resp["code"] != "PHOTO_TOO_LARGE" {
		t.Errorf("%d %v", code, resp)
	}
}

// pngHeader is a valid PNG signature and IHDR claiming w x h with no pixel data: DecodeConfig
// accepts it, so only a pre-decode check stops the allocation.
func pngHeader(w, h uint32) []byte {
	var buf bytes.Buffer
	buf.WriteString("\x89PNG\r\n\x1a\n")
	ihdr := make([]byte, 13)
	binary.BigEndian.PutUint32(ihdr[0:], w)
	binary.BigEndian.PutUint32(ihdr[4:], h)
	ihdr[8], ihdr[9] = 8, 2
	chunk := append([]byte("IHDR"), ihdr...)
	binary.Write(&buf, binary.BigEndian, uint32(len(ihdr)))
	buf.Write(chunk)
	binary.Write(&buf, binary.BigEndian, crc32.ChecksumIEEE(chunk))
	return buf.Bytes()
}

func TestUploadPhoto_RejectsTooManyPixels(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := newCustomID(t, uid, "Sled Push")
	for name, dims := range map[string][2]uint32{"area": {20000, 20000}, "side": {13000, 10}} {
		code, resp := uploadPhoto(t, uid, ex, pngHeader(dims[0], dims[1]), "image/png")
		if code != http.StatusRequestEntityTooLarge || resp["code"] != "PHOTO_TOO_LARGE" {
			t.Errorf("%s: %d %v", name, code, resp)
		}
	}
}

func TestUploadPhoto_OtherUsersExercise404(t *testing.T) {
	setupTestDB(t)
	a := createTestUser(t)
	b := secondUser(t)
	ex := newCustomID(t, a, "Sled Push")
	if code, resp := uploadPhoto(t, a, ex, testJPEG(t, 50, 50), "image/jpeg"); code != 200 {
		t.Fatalf("%d %v", code, resp)
	}

	code, resp := uploadPhoto(t, b, ex, testJPEG(t, 50, 50), "image/jpeg")
	if code != http.StatusNotFound || resp["code"] != "EXERCISE_NOT_FOUND" {
		t.Errorf("upload: %d %v", code, resp)
	}
	if w := photoRequest(b, ex, http.MethodDelete, "", th.DeleteExercisePhoto); w.Code != http.StatusNotFound {
		t.Errorf("delete: %d", w.Code)
	}
	if w := photoRequest(b, ex, http.MethodGet, "", th.GetExercisePhoto); w.Code != http.StatusNotFound {
		t.Errorf("get: %d", w.Code)
	}
	if w := photoRequest(a, ex, http.MethodGet, "", th.GetExercisePhoto); w.Code != http.StatusOK {
		t.Errorf("owner get: %d", w.Code)
	}

	catalog := createTestExercise(t)
	code, resp = uploadPhoto(t, a, catalog, testJPEG(t, 50, 50), "image/jpeg")
	if code != http.StatusForbidden || resp["code"] != "EXERCISE_NOT_CUSTOM" {
		t.Errorf("catalog upload: %d %v", code, resp)
	}
	if w := photoRequest(a, catalog, http.MethodGet, "", th.GetExercisePhoto); w.Code != http.StatusNotFound {
		t.Errorf("catalog get: %d", w.Code)
	}
}

func TestPhoto_ReplaceDeletesOldFiles(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := newCustomID(t, uid, "Sled Push")
	_, first := uploadPhoto(t, uid, ex, testJPEG(t, 400, 300), "image/jpeg")
	_, second := uploadPhoto(t, uid, ex, testJPEG(t, 400, 300), "image/jpeg")
	a, b := photoIDOf(first), photoIDOf(second)
	if a == "" || b == "" || a == b {
		t.Fatalf("ids %q %q must differ", a, b)
	}
	if got := photoFiles(t); len(got) != 2 {
		t.Errorf("files = %v, want only the new pair", got)
	}
	for _, thumb := range []bool{false, true} {
		if _, err := os.Stat(th.s.Photos.Path(a, thumb)); !os.IsNotExist(err) {
			t.Errorf("old file (thumb=%v) still there: %v", thumb, err)
		}
	}
}

func TestPhoto_DeleteRemovesFiles(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := newCustomID(t, uid, "Sled Push")
	uploadPhoto(t, uid, ex, testJPEG(t, 400, 300), "image/jpeg")
	for range 2 { // idempotent
		w := photoRequest(uid, ex, http.MethodDelete, "", th.DeleteExercisePhoto)
		resp := decodeResponse(t, w)
		if w.Code != http.StatusOK || photoIDOf(resp) != "" {
			t.Fatalf("%d %v", w.Code, resp)
		}
	}
	if got := photoFiles(t); len(got) != 0 {
		t.Errorf("files left: %v", got)
	}
	if w := photoRequest(uid, ex, http.MethodGet, "", th.GetExercisePhoto); w.Code != http.StatusNotFound {
		t.Errorf("get after delete: %d", w.Code)
	}
}

func TestDeleteAccount_RemovesPhotoFiles(t *testing.T) {
	setupTestDB(t)
	a := createTestUser(t)
	b := secondUser(t)
	mine := newCustomID(t, a, "Sled Push")
	theirs := newCustomID(t, b, "Sled Push")
	uploadPhoto(t, a, mine, testJPEG(t, 100, 100), "image/jpeg")
	uploadPhoto(t, b, theirs, testJPEG(t, 100, 100), "image/jpeg")
	if n := len(photoFiles(t)); n != 4 {
		t.Fatalf("files = %d", n)
	}
	if err := th.s.User.Delete(a); err != nil {
		t.Fatal(err)
	}
	if n := len(photoFiles(t)); n != 2 {
		t.Errorf("files after delete = %v, want only the other user's pair", photoFiles(t))
	}
	var n int
	db.DB.QueryRow(`SELECT COUNT(*) FROM exercises WHERE photo_id IS NOT NULL`).Scan(&n)
	if n != 1 {
		t.Errorf("photo rows = %d", n)
	}
}

func TestGetPhoto_ServesThumbAndFull(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := newCustomID(t, uid, "Sled Push")
	_, resp := uploadPhoto(t, uid, ex, testJPEG(t, 800, 600), "image/jpeg")
	id := photoIDOf(resp)

	full := photoRequest(uid, ex, http.MethodGet, "?v="+id, th.GetExercisePhoto)
	thumb := photoRequest(uid, ex, http.MethodGet, "?size=thumb&v="+id, th.GetExercisePhoto)
	for name, w := range map[string]*httptest.ResponseRecorder{"full": full, "thumb": thumb} {
		if w.Code != 200 || w.Header().Get("Content-Type") != "image/jpeg" {
			t.Errorf("%s: %d %q", name, w.Code, w.Header().Get("Content-Type"))
		}
		if cc := w.Header().Get("Cache-Control"); cc != "private, max-age=31536000, immutable" {
			t.Errorf("%s cache = %q", name, cc)
		}
	}
	fc, _ := jpeg.DecodeConfig(bytes.NewReader(full.Body.Bytes()))
	tc, _ := jpeg.DecodeConfig(bytes.NewReader(thumb.Body.Bytes()))
	if fc.Width != 800 || min(tc.Width, tc.Height) != 192 {
		t.Errorf("full %v thumb %v", fc, tc)
	}
	for _, q := range []string{"", "?v=stale"} {
		w := photoRequest(uid, ex, http.MethodGet, q, th.GetExercisePhoto)
		if cc := w.Header().Get("Cache-Control"); cc != "private, no-cache" {
			t.Errorf("%q cache = %q", q, cc)
		}
	}
}

func TestPhotoID_ReachesWorkoutExercises(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := newCustomID(t, uid, "Sled Push")
	_, resp := uploadPhoto(t, uid, ex, testJPEG(t, 100, 100), "image/jpeg")
	id := photoIDOf(resp)
	res, err := db.DB.Exec(`INSERT INTO workouts (user_id, name, started_at) VALUES (?, 'w', CURRENT_TIMESTAMP)`, uid)
	if err != nil {
		t.Fatal(err)
	}
	wid, _ := res.LastInsertId()
	if _, err := db.DB.Exec(`INSERT INTO workout_exercises (workout_id, exercise_id, order_index) VALUES (?, ?, 0)`, wid, ex); err != nil {
		t.Fatal(err)
	}
	w, err := th.s.Workout.Get(uid, wid, "")
	if err != nil {
		t.Fatal(err)
	}
	if got := w.Exercises[0].Exercise.PhotoID; got != id {
		t.Errorf("embedded photo_id = %q, want %q", got, id)
	}
}

func TestServerInfo_AdvertisesCustomExercisePhotos(t *testing.T) {
	setupTestDB(t)
	c, w := newContext(0, "GET", "/api/v1/info", nil)
	th.ServerInfo(c)
	if got := decodeResponse(t, w)["data"].(map[string]any)["custom_exercise_photos"]; got != true {
		t.Errorf("custom_exercise_photos = %v, want true", got)
	}
}
