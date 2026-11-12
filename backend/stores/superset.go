package stores

import "database/sql"

// SupersetsContiguous reports whether every non-null label occupies one
// unbroken run of rows. Request validation and carrySupersetGroups both use it.
func SupersetsContiguous(groups []*int) bool {
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

// carrySupersetGroups gives each requested row the label its exercise held before, for an edit
// from a client too old to send labels: without it that edit would silently unlink every
// superset. Rows are matched by exercise and occurrence (the second Bench Press takes the
// second Bench Press's label). If the old client reordered rows so a carried label is no
// longer one run, nothing is carried: it cannot show supersets, so failing its save would be
// worse than unlinking. The result still goes through normaliseSupersetGroups, which drops a
// group the edit left with one member.
func carrySupersetGroups(prevIDs []int64, prevGroups []*int, ids []int64) []*int {
	type occurrence struct {
		id int64
		n  int
	}
	held := make(map[occurrence]*int, len(prevIDs))
	seen := map[int64]int{}
	for i, id := range prevIDs {
		held[occurrence{id, seen[id]}] = prevGroups[i]
		seen[id]++
	}
	out := make([]*int, len(ids))
	seen = map[int64]int{}
	for i, id := range ids {
		out[i] = held[occurrence{id, seen[id]}]
		seen[id]++
	}
	if !SupersetsContiguous(out) {
		return make([]*int, len(ids))
	}
	return out
}

// storedSupersetGroups reads the exercise ids and labels of rows in order. The query selects
// exercise_id and superset_group for one parent, ordered by order_index.
func storedSupersetGroups(tx *sql.Tx, query string, parentID int64) ([]int64, []*int, error) {
	rows, err := tx.Query(query, parentID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var ids []int64
	var groups []*int
	for rows.Next() {
		var id int64
		var g sql.NullInt64
		if err := rows.Scan(&id, &g); err != nil {
			return nil, nil, err
		}
		ids = append(ids, id)
		groups = append(groups, nullableInt(g))
	}
	return ids, groups, rows.Err()
}

func nullableInt(n sql.NullInt64) *int {
	if !n.Valid {
		return nil
	}
	v := int(n.Int64)
	return &v
}
