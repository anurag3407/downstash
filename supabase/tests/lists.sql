-- @file supabase/tests/lists.sql — list command family (§7.8).
select tests.reset();

-- LPUSH / RPUSH ordering
select tests.eq(tests.run(array['RPUSH','l','a','b','c']), '3', 'RPUSH → 3');
select tests.eq(tests.run(array['LRANGE','l','0','-1']), '["a","b","c"]', 'RPUSH order');
select tests.run(array['DEL','l']);
select tests.eq(tests.run(array['LPUSH','l','a','b','c']), '3', 'LPUSH → 3');
select tests.eq(tests.run(array['LRANGE','l','0','-1']), '["c","b","a"]', 'LPUSH a b c → [c,b,a]');

select tests.eq(tests.run(array['LLEN','l']), '3', 'LLEN → 3');
select tests.eq(tests.run(array['LINDEX','l','0']), '"c"', 'LINDEX 0');
select tests.eq(tests.run(array['LINDEX','l','-1']), '"a"', 'LINDEX -1');
select tests.eq(tests.run(array['LINDEX','l','99']), 'null', 'LINDEX out of range');

-- LRANGE negative indices
select tests.eq(tests.run(array['LRANGE','l','-2','-1']), '["b","a"]', 'LRANGE negative');

-- LPUSHX / RPUSHX (missing → 0)
select tests.eq(tests.run(array['LPUSHX','nolist','x']), '0', 'LPUSHX missing → 0');
select tests.eq(tests.run(array['RPUSHX','l','z']), '4', 'RPUSHX existing');

-- LPOP / RPOP
select tests.eq(tests.run(array['LPOP','l']), '"c"', 'LPOP → c');
select tests.eq(tests.run(array['RPOP','l']), '"z"', 'RPOP → z');
select tests.eq(tests.run(array['LPOP','nolist']), 'null', 'LPOP missing → null');

-- LPOP/RPOP with count
select tests.run(array['DEL','cl']);
select tests.run(array['RPUSH','cl','1','2','3','4']);
select tests.eq(tests.run(array['LPOP','cl','2']), '["1","2"]', 'LPOP count 2');
select tests.eq(tests.run(array['RPOP','cl','2']), '["4","3"]', 'RPOP count 2');
select tests.eq(tests.run(array['EXISTS','cl']), '0', 'list emptied → deleted');

-- LSET / LREM / LTRIM
select tests.run(array['RPUSH','ls','a','b','c','b']);
select tests.eq(tests.run(array['LSET','ls','0','x']), '"OK"', 'LSET');
select tests.eq(tests.run(array['LRANGE','ls','0','0']), '["x"]', 'LSET applied');
select tests.eq(tests.run(array['LREM','ls','0','b']), '2', 'LREM 0 → all');
select tests.eq(tests.run(array['LTRIM','ls','0','0']), '"OK"', 'LTRIM');
select tests.eq(tests.run(array['LLEN','ls']), '1', 'LTRIM length');

-- LPOS
select tests.run(array['RPUSH','lp','a','b','c','b']);
select tests.eq(tests.run(array['LPOS','lp','b']), '1', 'LPOS first b');

-- WRONGTYPE
select tests.run(array['SET','wl','v']);
select tests.raises(array['LRANGE','wl','0','-1'], 'WRONGTYPE Operation against a key holding the wrong kind of value', 'LRANGE on string');
