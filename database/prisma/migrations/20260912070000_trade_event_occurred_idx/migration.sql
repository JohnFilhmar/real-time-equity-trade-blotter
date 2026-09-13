-- The global event feed reads the whole log newest first and pages through it by keyset on
-- (occurred_at, id). The existing index serves one trade's history, not the feed, so without this
-- one every page of the feed is a sort of the entire table. The id column is in the index in the
-- same direction as the sort, so the tiebreaker is served by the index rather than by a re-sort.
CREATE INDEX "trade_event_occurred_idx" ON "trade_event"("occurred_at" DESC, "id" DESC);
