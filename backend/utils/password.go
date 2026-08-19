package utils

import "golang.org/x/crypto/bcrypt"

// MaxPasswordBytes is bcrypt's own hard limit, not a policy choice.
// GenerateFromPassword refuses anything longer rather than silently truncating, so a
// password over this length cannot be stored at all.
//
// Counted in BYTES, which is why it is checked here rather than with the validator's
// `max` tag: that tag counts runes, and a 19-character emoji passphrase is 76 bytes.
// The `min=8` tag stays rune-counted, which is the right unit for a minimum.
const MaxPasswordBytes = 72

// PasswordTooLong reports whether bcrypt would reject this password outright.
//
// Callers must check before hashing. Without it the bcrypt error surfaces as a 500, which
// tells the user the server broke and to try again — advice that can never work, on input
// a password manager produces by default.
func PasswordTooLong(plain string) bool {
	return len(plain) > MaxPasswordBytes
}

// PasswordTooLongMessage is the one wording for the limit, so the two handlers and the
// reset-password command cannot describe it differently.
const PasswordTooLongMessage = "password must be 72 bytes or fewer (accented letters and emoji count for more than one)"

func HashPassword(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	return string(b), err
}

func CheckPassword(plain, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}
