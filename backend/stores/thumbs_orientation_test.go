package stores

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

// jpegWithOrientation encodes a 40x20 image (left half red, right half blue) and inserts an
// APP1 Exif segment whose IFD0 holds Orientation = orient, big-endian.
func jpegWithOrientation(t *testing.T, orient byte) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 40, 20))
	for y := 0; y < 20; y++ {
		for x := 0; x < 40; x++ {
			c := color.RGBA{220, 0, 0, 255}
			if x >= 20 {
				c = color.RGBA{0, 0, 220, 255}
			}
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	tiff := []byte{'M', 'M', 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orient, 0, 0, 0, 0, 0, 0}
	payload := append([]byte("Exif\x00\x00"), tiff...)
	seg := append([]byte{0xFF, 0xE1, byte((len(payload) + 2) >> 8), byte(len(payload) + 2)}, payload...)
	src := buf.Bytes()
	return append(append(append([]byte{}, src[:2]...), seg...), src[2:]...)
}

func TestRenderJPEG_AppliesEXIFOrientation(t *testing.T) {
	keep := func(w, h int) (int, int) { return w, h }
	for _, tc := range []struct {
		orient    byte
		w, h      int
		topIsRed  bool // probe the top-centre pixel
		leftIsRed bool // probe the middle-left pixel
		checkLeft bool
		checkTop  bool
	}{
		{orient: 1, w: 40, h: 20, leftIsRed: true, checkLeft: true},
		{orient: 6, w: 20, h: 40, topIsRed: true, checkTop: true},  // 90° clockwise: old left is now the top
		{orient: 8, w: 20, h: 40, topIsRed: false, checkTop: true}, // 90° counter-clockwise: old right on top
		{orient: 3, w: 40, h: 20, leftIsRed: false, checkLeft: true},
	} {
		out, err := renderJPEG(jpegWithOrientation(t, tc.orient), maxPhotoPixels, 0, 95, keep)
		if err != nil {
			t.Fatalf("orientation %d: %v", tc.orient, err)
		}
		img, err := jpeg.Decode(bytes.NewReader(out))
		if err != nil {
			t.Fatal(err)
		}
		if b := img.Bounds(); b.Dx() != tc.w || b.Dy() != tc.h {
			t.Fatalf("orientation %d: got %dx%d, want %dx%d", tc.orient, b.Dx(), b.Dy(), tc.w, tc.h)
		}
		red := func(x, y int) bool { r, _, bl, _ := img.At(x, y).RGBA(); return r > bl }
		if tc.checkTop && red(tc.w/2, 2) != tc.topIsRed {
			t.Errorf("orientation %d: top is red = %v, want %v", tc.orient, !tc.topIsRed, tc.topIsRed)
		}
		if tc.checkLeft && red(2, tc.h/2) != tc.leftIsRed {
			t.Errorf("orientation %d: left is red = %v, want %v", tc.orient, !tc.leftIsRed, tc.leftIsRed)
		}
	}
	if got := exifOrientation([]byte("not a jpeg")); got != 1 {
		t.Errorf("non-JPEG orientation = %d, want 1", got)
	}
}
