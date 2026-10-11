-- @file supabase/tests/keyspace.sql — keyspace & expiry family (§7.8).
select tests.reset();

-- EXISTS / DEL / UNLINK / TYPE
select tests.run(array['SET','k','v']);
select tests.run(array['SET','k2','v']);
select tests.eq(tests.run(array['EXISTS','k','k2','nope']), '2', 'EXISTS counts present');
select tests.eq(tests.run(array['EXISTS','k','k','k']), '3', 'EXISTS repeats count repeatedly');
select tests.eq(tests.run(array['TYPE','k']), '"string"', 'TYPE string');
select tests.eq(tests.run(array['TYPE','nope']), '"none"', 'TYPE missing → none');
select tests.eq(tests.run(array['DEL','k','k2','nope']), '2', 'DEL counts live removed');
select tests.eq(tests.run(array['EXISTS','k']), '0', 'DEL removed');

-- RENAME / RENAMENX
select tests.run(array['SET','a','1']);
select tests.eq(tests.run(array['RENAME','a','b']), '"OK"', 'RENAME');
select tests.eq(tests.run(array['GET','b']), '"1"', 'RENAME moved value');
select tests.eq(tests.run(array['EXISTS','a']), '0', 'RENAME removed source');
select tests.raises(array['RENAME','nope','c'], 'ERR no such key', 'RENAME missing');
select tests.run(array['SET','c','2']);
select tests.eq(tests.run(array['RENAMENX','b','c']), '0', 'RENAMENX to existing → 0');
select tests.eq(tests.run(array['RENAMENX','b','d']), '1', 'RENAMENX to new → 1');

-- RENAME keeps TTL
select tests.run(array['SET','t','v','EX','100']);
select tests.run(array['RENAME','t','t2']);
select tests.true((tests.run(array['PTTL','t2']))::int > 0, 'RENAME kept TTL');

-- EXPIRE / TTL / PERSIST
select tests.run(array['SET','e','v']);
select tests.eq(tests.run(array['TTL','e']), '-1', 'TTL no expiry → -1');
select tests.eq(tests.run(array['TTL','nope']), '-2', 'TTL missing → -2');
select tests.eq(tests.run(array['EXPIRE','e','100']), '1', 'EXPIRE → 1');
select tests.eq(tests.run(array['TTL','e']), '100', 'TTL after EXPIRE');
select tests.eq(tests.run(array['PERSIST','e']), '1', 'PERSIST removed → 1');
select tests.eq(tests.run(array['TTL','e']), '-1', 'TTL after PERSIST → -1');
select tests.eq(tests.run(array['PERSIST','e']), '0', 'PERSIST no TTL → 0');
-- EXPIRE ≤ 0 deletes
select tests.eq(tests.run(array['EXPIRE','e','-1']), '1', 'EXPIRE negative → 1');
select tests.eq(tests.run(array['EXISTS','e']), '0', 'EXPIRE negative deleted');
-- EXPIRE missing → 0
select tests.eq(tests.run(array['EXPIRE','nope','100']), '0', 'EXPIRE missing → 0');

-- KEYS / SCAN
-- Live keys at this point: d (b renamed), c, t2 (t renamed, kept TTL), user:1, user:2, other.
select tests.run(array['SET','user:1','a']);
select tests.run(array['SET','user:2','b']);
select tests.run(array['SET','other','c']);
select tests.eq(to_jsonb((select count(*) from jsonb_array_elements(tests.run(array['KEYS','user:*'])) x)), '2', 'KEYS user:* matches 2');
select tests.eq(to_jsonb((select count(*) from jsonb_array_elements(tests.run(array['KEYS','*'])) x)), '6', 'KEYS * matches 6');
-- SCAN from cursor 0
select tests.eq(to_jsonb(jsonb_array_length((tests.run(array['SCAN','0']))->1)), '6', 'SCAN returns all keys');
select tests.eq(to_jsonb((tests.run(array['SCAN','0']))->>0), '"0"', 'SCAN one-page → next cursor 0');

-- DBSIZE / RANDOMKEY
select tests.eq(tests.run(array['DBSIZE']), '6', 'DBSIZE');
select tests.true(tests.run(array['RANDOMKEY']) is not null, 'RANDOMKEY returns a key');
