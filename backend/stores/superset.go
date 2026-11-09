package stores

import "database/sql"

// normaliseSupersetGroups nulls every group with fewer than two members and
// renumbers the rest 1..n in row order. It never reorders rows. Callers have
// already rejected non-contiguous labels, so a label is one run.
func normaliseSupersetGroups(groups []*int) []*int {
	out := make([]*int, len(groups))
	counts := map[int]int{}
	for _, g := range groups {
		if g != nil {
			counts[*g]++
		}
	}
	next := 0
	assigned := map[int]int{}
	for i, g := range groups {
		if g == nil || counts[*g] < 2 {
			continue
		}
		n, ok := assigned[*g]
		if !ok {
			next++
			n = next
			assigned[*g] = n
		}
		v := n
		out[i] = &v
	}
	return out
}

func nullableInt(n sql.NullInt64) *int {
	if !n.Valid {
		return nil
	}
	v := int(n.Int64)
	return &v
}
