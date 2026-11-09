package controllers

// supersetsContiguous reports whether every non-null label occupies one
// unbroken run of rows.
func supersetsContiguous(groups []*int) bool {
	closed := map[int]bool{}
	var current *int
	for _, g := range groups {
		if g == nil {
			if current != nil {
				closed[*current] = true
				current = nil
			}
			continue
		}
		if current != nil && *current == *g {
			continue
		}
		if current != nil {
			closed[*current] = true
		}
		if closed[*g] {
			return false
		}
		current = g
	}
	return true
}
