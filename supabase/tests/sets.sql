-- @file supabase/tests/sets.sql — set command family (§7.8).
select tests.reset();

select tests.eq(tests.run(array['SADD','s','a','b','c']), '3', 'SADD → 3');
select tests.eq(tests.run(array['SADD','s','a','d']), '1', 'SADD dup+new → 1');
select tests.eq(tests.run(array['SCARD','s']), '4', 'SCARD → 4');
select tests.eq(tests.run(array['SISMEMBER','s','a']), '1', 'SISMEMBER → 1');
select tests.eq(tests.run(array['SISMEMBER','s','z']), '0', 'SISMEMBER → 0');
select tests.eq(tests.run(array['SMISMEMBER','s','a','z','d']), '[1,0,1]', 'SMISMEMBER');
select tests.eq(to_jsonb((select jsonb_array_length(tests.run(array['SMEMBERS','s'])))), '4', 'SMEMBERS length');

select tests.eq(tests.run(array['SREM','s','a','b','z']), '2', 'SREM → 2');
select tests.eq(tests.run(array['SCARD','s']), '2', 'SCARD after SREM');

-- Set algebra
select tests.run(array['SADD','s1','a','b','c','d']);
select tests.run(array['SADD','s2','c','d','e','f']);
select tests.eq(tests.run(array['SINTER','s1','s2']), '["c","d"]', 'SINTER');
select tests.eq(tests.run(array['SUNION','s1','s2']), '["a","b","c","d","e","f"]', 'SUNION');
select tests.eq(tests.run(array['SDIFF','s1','s2']), '["a","b"]', 'SDIFF');

-- SPOP / SRANDMEMBER
select tests.run(array['SADD','sp','x','y','z']);
select tests.true(tests.run(array['SRANDMEMBER','sp']) is not null, 'SRANDMEMBER returns value');
select tests.eq(to_jsonb((select jsonb_array_length(tests.run(array['SRANDMEMBER','sp','2'])))), '2', 'SRANDMEMBER count 2');
select tests.true(tests.run(array['SPOP','sp','1']) is not null, 'SPOP count 1');

-- WRONGTYPE
select tests.run(array['SET','ws','v']);
select tests.raises(array['SADD','ws','a'], 'WRONGTYPE Operation against a key holding the wrong kind of value', 'SADD on string');
