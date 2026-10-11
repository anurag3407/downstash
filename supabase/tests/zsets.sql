-- @file supabase/tests/zsets.sql — sorted-set command family (§7.8).
select tests.reset();

-- ZADD basics: members ordered by score asc, then member byte order.
select tests.eq(tests.run(array['ZADD','z','1','a','2','b','3','c']), '3', 'ZADD → 3 added');
select tests.eq(tests.run(array['ZCARD','z']), '3', 'ZCARD → 3');
select tests.eq(tests.run(array['ZRANGE','z','0','-1']), '["a","b","c"]', 'ZRANGE all by score');
select tests.eq(tests.run(array['ZRANGE','z','0','1']), '["a","b"]', 'ZRANGE 0..1');
select tests.eq(tests.run(array['ZRANGE','z','0','-1','WITHSCORES']), '["a","1","b","2","c","3"]', 'ZRANGE WITHSCORES');
select tests.eq(tests.run(array['ZRANGE','z','0','-1','REV']), '["c","b","a"]', 'ZRANGE REV');

-- ZSCORE / ZMSCORE
select tests.eq(tests.run(array['ZSCORE','z','b']), '"2"', 'ZSCORE → 2');
select tests.eq(tests.run(array['ZSCORE','z','nope']), 'null', 'ZSCORE missing → null');
select tests.eq(tests.run(array['ZMSCORE','z','a','nope','c']), '["1",null,"3"]', 'ZMSCORE');

-- ZRANK / ZREVRANK
select tests.eq(tests.run(array['ZRANK','z','a']), '0', 'ZRANK a → 0');
select tests.eq(tests.run(array['ZRANK','z','c']), '2', 'ZRANK c → 2');
select tests.eq(tests.run(array['ZREVRANK','z','c']), '0', 'ZREVRANK c → 0');
select tests.eq(tests.run(array['ZRANK','z','nope']), 'null', 'ZRANK missing → null');

-- ZADD updates score; CH reports changed count (options lead the score/member pairs)
select tests.eq(tests.run(array['ZADD','z','5','a']), '0', 'ZADD update → 0 added');
select tests.eq(tests.run(array['ZADD','z','CH','5','a']), '0', 'ZADD same score CH → 0 changed');
select tests.eq(tests.run(array['ZADD','z','CH','9','a']), '1', 'ZADD new score CH → 1 changed');
select tests.eq(tests.run(array['ZSCORE','z','a']), '"9"', 'ZSCORE after update → 9');

-- NX / XX / GT / LT
select tests.eq(tests.run(array['ZADD','z','NX','50','c']), '0', 'ZADD NX existing → 0');
select tests.eq(tests.run(array['ZSCORE','z','c']), '"3"', 'ZADD NX did not change score');
select tests.eq(tests.run(array['ZADD','z','XX','50','c']), '0', 'ZADD XX existing → 0');
select tests.eq(tests.run(array['ZSCORE','z','c']), '"50"', 'ZADD XX updated score');
select tests.eq(tests.run(array['ZADD','z','XX','50','new']), '0', 'ZADD XX missing → 0');
select tests.eq(tests.run(array['ZCARD','z']), '3', 'ZADD XX did not add missing');

-- GT only increases
select tests.eq(tests.run(array['ZADD','z','GT','10','a']), '0', 'ZADD GT increase');
select tests.eq(tests.run(array['ZSCORE','z','a']), '"10"', 'ZADD GT raised score');
select tests.eq(tests.run(array['ZADD','z','GT','2','a']), '0', 'ZADD GT lower ignored');
select tests.eq(tests.run(array['ZSCORE','z','a']), '"10"', 'ZADD GT kept higher score');

-- ZINCRBY
select tests.eq(tests.run(array['ZINCRBY','z','5','b']), '"7"', 'ZINCRBY → 7');
select tests.eq(tests.run(array['ZINCRBY','z','-1.5','b']), '"5.5"', 'ZINCRBY float → 5.5');

-- ZRANGE BYSCORE with inclusive/exclusive and +/-inf
select tests.run(array['DEL','sb']);
select tests.run(array['ZADD','sb','1','a','2','b','3','c','4','d']);
select tests.eq(tests.run(array['ZRANGE','sb','2','3','BYSCORE']), '["b","c"]', 'ZRANGE BYSCORE 2..3');
select tests.eq(tests.run(array['ZRANGE','sb','(2','4','BYSCORE']), '["c","d"]', 'ZRANGE BYSCORE exclusive min');
select tests.eq(tests.run(array['ZRANGE','sb','-inf','+inf','BYSCORE']), '["a","b","c","d"]', 'ZRANGE BYSCORE inf');
select tests.eq(tests.run(array['ZCOUNT','sb','2','3']), '2', 'ZCOUNT 2..3 → 2');
select tests.eq(tests.run(array['ZCOUNT','sb','2','(3']), '1', 'ZCOUNT 2..(3 → 1');

-- ZRANGE BYSCORE REV
select tests.eq(tests.run(array['ZRANGE','sb','3','2','BYSCORE','REV']), '["c","b"]', 'ZRANGE BYSCORE REV');

-- ZRANGE LIMIT
select tests.eq(tests.run(array['ZRANGE','sb','-inf','+inf','BYSCORE','LIMIT','1','2']), '["b","c"]', 'ZRANGE LIMIT');

-- ZREMRANGEBYSCORE / ZREMRANGEBYRANK
select tests.eq(tests.run(array['ZREMRANGEBYSCORE','sb','1','2']), '2', 'ZREMRANGEBYSCORE 1..2 → 2');
select tests.eq(tests.run(array['ZRANGE','sb','0','-1']), '["c","d"]', 'after score remove');
select tests.eq(tests.run(array['ZREMRANGEBYRANK','sb','0','0']), '1', 'ZREMRANGEBYRANK → 1');

-- ZREM and empty-key deletion
select tests.eq(tests.run(array['ZREM','sb','d']), '1', 'ZREM last member');
select tests.eq(tests.run(array['ZCARD','sb']), '0', 'ZCARD → 0 (key deleted)');
select tests.eq(tests.run(array['ZRANGE','sb','0','-1']), '[]', 'ZRANGE on empty/missing');

-- BYLEX is not supported
select tests.raises(array['ZRANGE','sb','[a','[z','BYLEX'], 'ERR Downstash: BYLEX is not supported', 'BYLEX rejected');

-- WRONGTYPE
select tests.run(array['SET','wtz','v']);
select tests.raises(array['ZADD','wtz','1','a'], 'WRONGTYPE Operation against a key holding the wrong kind of value', 'ZADD on string');
select tests.reset();
