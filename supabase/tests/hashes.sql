-- @file supabase/tests/hashes.sql — hash command family (§7.8).
select tests.reset();

select tests.eq(tests.run(array['HSET','h','f1','v1','f2','v2']), '2', 'HSET adds fields');
select tests.eq(tests.run(array['HSET','h','f1','x']), '0', 'HSET existing → 0 added');
select tests.eq(tests.run(array['HGET','h','f1']), '"x"', 'HGET updated value');
select tests.eq(tests.run(array['HGET','h','nope']), 'null', 'HGET missing field → null');
select tests.eq(tests.run(array['HGET','nokey','f']), 'null', 'HGET missing key → null');

select tests.eq(tests.run(array['HSETNX','h','f3','v3']), '1', 'HSETNX new → 1');
select tests.eq(tests.run(array['HSETNX','h','f1','nope']), '0', 'HSETNX existing → 0');

select tests.eq(tests.run(array['HMGET','h','f1','nope','f3']), '["x",null,"v3"]', 'HMGET mixed');
select tests.eq(to_jsonb(jsonb_array_length(tests.run(array['HGETALL','h']))), '6', 'HGETALL flat array length');

select tests.eq(tests.run(array['HLEN','h']), '3', 'HLEN → 3');
select tests.eq(tests.run(array['HEXISTS','h','f1']), '1', 'HEXISTS → 1');
select tests.eq(tests.run(array['HEXISTS','h','nope']), '0', 'HEXISTS → 0');
select tests.eq(tests.run(array['HSTRLEN','h','f1']), '1', 'HSTRLEN → 1');
select tests.eq(tests.run(array['HSTRLEN','h','nope']), '0', 'HSTRLEN missing → 0');

select tests.eq(to_jsonb(jsonb_array_length(tests.run(array['HKEYS','h']))), '3', 'HKEYS length');
select tests.eq(to_jsonb(jsonb_array_length(tests.run(array['HVALS','h']))), '3', 'HVALS length');

-- HMSET returns OK
select tests.eq(tests.run(array['HMSET','h2','a','1']), '"OK"', 'HMSET → OK');

-- HINCRBY / HINCRBYFLOAT
select tests.eq(tests.run(array['HINCRBY','h','n','5']), '5', 'HINCRBY → 5');
select tests.eq(tests.run(array['HINCRBY','h','n','3']), '8', 'HINCRBY → 8');
select tests.eq(tests.run(array['HINCRBYFLOAT','h','fn','1.5']), '"1.5"', 'HINCRBYFLOAT → 1.5');
select tests.run(array['HSET','h','bad','notint']);
select tests.raises(array['HINCRBY','h','bad','1'], 'ERR hash value is not an integer', 'HINCRBY non-int');

-- HDEL + auto-delete when empty
select tests.run(array['HSET','tmp','x','y']);
select tests.eq(tests.run(array['HDEL','tmp','x']), '1', 'HDEL → 1');
select tests.eq(tests.run(array['EXISTS','tmp']), '0', 'HDEL deleted empty key');
select tests.eq(tests.run(array['HDEL','h','f1','f2','f3']), '3', 'HDEL multiple');

-- HRANDFIELD
select tests.run(array['HSET','rf','a','1','b','2','c','3']);
select tests.true(tests.run(array['HRANDFIELD','rf']) is not null, 'HRANDFIELD returns a value');
select tests.eq(to_jsonb(jsonb_array_length(tests.run(array['HRANDFIELD','rf','2']))), '2', 'HRANDFIELD count 2');

-- WRONGTYPE
select tests.run(array['SET','wh','v']);
select tests.raises(array['HGET','wh','f'], 'WRONGTYPE Operation against a key holding the wrong kind of value', 'HGET on string → WRONGTYPE');
