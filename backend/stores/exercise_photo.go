package stores

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sync"

	"github.com/Cawlumm/lyftr-backend/models"
)

// A custom exercise has at most one photo: two JPEGs named by a random photo_id, kept beside
// the database so they share its volume and its backups. The id changes on every replace, so
// a client can cache by it forever and a stale copy can never be served for a new photo.
const (
	// MaxPhotoBytes is the largest upload accepted; the route's body cap is the same figure.
	MaxPhotoBytes = 10 << 20
	// maxPhotoPixels and maxPhotoSide refuse a decompression bomb from the header alone.
	maxPhotoPixels = 40_000_000
	maxPhotoSide   = 12_000
	// PhotoEdge is the longest side a stored photo keeps. Never scaled up.
	PhotoEdge    = 1600
	photoQuality = 85
	// maxPhotoWork bounds concurrent decodes: a 40 MP source is ~60 MB while decoding.
	maxPhotoWork = 2
)

var (
	// ErrPhotoInvalid: the bytes are not a JPEG, PNG or WebP that decodes.
	ErrPhotoInvalid = errors.New("not a readable photo")
	// ErrPhotoTooLarge: the photo is over the size or pixel limits.
	ErrPhotoTooLarge = errors.New("photo too large")
	// ErrNoPhoto: the exercise has no photo (or is not one that can have any).
	ErrNoPhoto = errors.New("exercise has no photo")

	photoIDPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)
	photoWork      = make(chan struct{}, maxPhotoWork)
)

// PhotoFiles is the directory of photo files. Paths are only ever built from a photo_id that
// matches photoIDPattern, never from request input.
type PhotoFiles struct {
	mu  sync.RWMutex
	dir string
}

func (p *PhotoFiles) SetDir(dir string) {
	p.mu.Lock()
	p.dir = dir
	p.mu.Unlock()
}

func (p *PhotoFiles) directory() string {
	if p == nil {
		return ""
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.dir
}

// Path is the file for a photo_id, or "" when the id is not one this store issued.
func (p *PhotoFiles) Path(id string, thumb bool) string {
	dir := p.directory()
	if dir == "" || !photoIDPattern.MatchString(id) {
		return ""
	}
	if thumb {
		return filepath.Join(dir, id+"-thumb.jpg")
	}
	return filepath.Join(dir, id+".jpg")
}

// write puts both renditions on disk, each written whole then renamed.
func (p *PhotoFiles) write(id string, full, thumb []byte) error {
	dir := p.directory()
	if dir == "" {
		return errors.New("photo directory is not configured")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	for _, f := range []struct {
		path string
		data []byte
	}{{p.Path(id, false), full}, {p.Path(id, true), thumb}} {
		if err := writeFileAtomic(dir, f.path, f.data); err != nil {
			p.Remove(id)
			return err
		}
	}
	return nil
}

func writeFileAtomic(dir, path string, data []byte) error {
	tmp, err := os.CreateTemp(dir, "photo.*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// Remove deletes both files of a photo, best effort: a leftover file is only wasted disk.
func (p *PhotoFiles) Remove(id string) {
	for _, thumb := range []bool{false, true} {
		path := p.Path(id, thumb)
		if path == "" {
			continue
		}
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Printf("exercise photo: remove %s: %v", id, err)
		}
	}
}

func (p *PhotoFiles) RemoveAll(ids []string) {
	for _, id := range ids {
		p.Remove(id)
	}
}

func newPhotoID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

// processPhoto re-encodes an upload as a JPEG of at most PhotoEdge on its long side, plus its
// thumbnail. The format is decided by decoding, never by what the client claims.
func processPhoto(src []byte) (full, thumb []byte, err error) {
	photoWork <- struct{}{}
	defer func() { <-photoWork }()
	full, err = renderJPEG(src, maxPhotoPixels, maxPhotoSide, photoQuality, func(w, h int) (int, int) {
		long := max(w, h)
		if long > PhotoEdge {
			return w * PhotoEdge / long, h * PhotoEdge / long
		}
		return w, h
	})
	switch {
	case errors.Is(err, errImageTooBig):
		return nil, nil, ErrPhotoTooLarge
	case err != nil:
		return nil, nil, fmt.Errorf("%w: %v", ErrPhotoInvalid, err)
	}
	// The thumbnail comes from the scaled photo (at most 2.5 MP), not the original.
	if thumb, err = Thumbnail(full); err != nil {
		return nil, nil, err
	}
	return full, thumb, nil
}

// CheckOwned reports ErrExerciseNotFound / ErrNotCustom unless the caller owns the custom exercise.
func (s *ExerciseStore) CheckOwned(userID, id int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = owned(tx, userID, id)
	return err
}

// SetPhoto replaces the photo of one of the caller's custom exercises. The previous photo's
// files go only after the new id is committed; the new files go if the commit fails.
func (s *ExerciseStore) SetPhoto(userID, id int64, src []byte) (models.Exercise, error) {
	if err := s.CheckOwned(userID, id); err != nil {
		return models.Exercise{}, err
	}
	full, thumb, err := processPhoto(src)
	if err != nil {
		return models.Exercise{}, err
	}
	photoID, err := newPhotoID()
	if err != nil {
		return models.Exercise{}, err
	}
	if err := s.photos.write(photoID, full, thumb); err != nil {
		return models.Exercise{}, fmt.Errorf("store photo: %w", err)
	}
	var old string
	e, err := inTx(s.db, func(tx *sql.Tx) (models.Exercise, error) {
		if _, err := owned(tx, userID, id); err != nil {
			return models.Exercise{}, err
		}
		if old, err = photoIDTx(tx, id); err != nil {
			return models.Exercise{}, err
		}
		if _, err := tx.Exec(`UPDATE exercises SET photo_id = ? WHERE id = ?`, photoID, id); err != nil {
			return models.Exercise{}, err
		}
		return s.getTx(tx, id)
	})
	if err != nil {
		s.photos.Remove(photoID)
		return models.Exercise{}, err
	}
	if old != "" {
		s.photos.Remove(old)
	}
	return e, nil
}

// ClearPhoto removes the photo; an exercise without one is left as it is.
func (s *ExerciseStore) ClearPhoto(userID, id int64) (models.Exercise, error) {
	var old string
	e, err := inTx(s.db, func(tx *sql.Tx) (models.Exercise, error) {
		if _, err := owned(tx, userID, id); err != nil {
			return models.Exercise{}, err
		}
		var err error
		if old, err = photoIDTx(tx, id); err != nil {
			return models.Exercise{}, err
		}
		if _, err := tx.Exec(`UPDATE exercises SET photo_id = NULL WHERE id = ?`, id); err != nil {
			return models.Exercise{}, err
		}
		return s.getTx(tx, id)
	})
	if err != nil {
		return models.Exercise{}, err
	}
	if old != "" {
		s.photos.Remove(old)
	}
	return e, nil
}

func photoIDTx(tx *sql.Tx, id int64) (string, error) {
	var p sql.NullString
	if err := tx.QueryRow(`SELECT photo_id FROM exercises WHERE id = ?`, id).Scan(&p); err != nil {
		return "", err
	}
	return p.String, nil
}

// PhotoFile resolves the file for the caller's own exercise's photo. Another user's custom
// exercise, a catalog row and a missing id all answer ErrExerciseNotFound; a custom exercise
// without a photo answers ErrNoPhoto. photoID is the current id, for the cache header.
func (s *ExerciseStore) PhotoFile(userID, id int64, thumb bool) (path, photoID string, err error) {
	var owner sql.NullInt64
	var p sql.NullString
	err = s.db.QueryRow(`SELECT owner_user_id, photo_id FROM exercises WHERE id = ?`, id).Scan(&owner, &p)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && (!owner.Valid || owner.Int64 != userID)) {
		return "", "", ErrExerciseNotFound
	}
	if err != nil {
		return "", "", err
	}
	if p.String == "" {
		return "", "", ErrNoPhoto
	}
	if path = s.photos.Path(p.String, thumb); path == "" {
		return "", "", ErrNoPhoto
	}
	return path, p.String, nil
}

// deletableCustomPhotos lists the photo ids of the user's custom exercises that Delete is
// about to remove (the ones no workout or program still references).
func deletableCustomPhotos(tx *sql.Tx, uid int64) ([]string, error) {
	rows, err := tx.Query(`SELECT photo_id FROM exercises WHERE owner_user_id = ? AND photo_id IS NOT NULL AND photo_id != ''
		AND id NOT IN (SELECT exercise_id FROM workout_exercises)
		AND id NOT IN (SELECT exercise_id FROM program_exercises)`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
