-- @file supabase/tests/strings.sql — string command family (§7.8).
select tests.reset();

-- GET / SET basics
select tests.eq(tests.run(array['SET','s','hello']), '"OK"', 'SET returns OK');
select tests.eq(tests.run(array['GET','s']), '"hello"', 'GET returns value');
select tests.eq(tests.run(array['GET','missing']), 'null', 'GET missing → null');

-- SET options
select tests.eq(tests.run(array['SET','nx','v','NX']), '"OK"', 'SET NX on missing');
select tests.eq(tests.run(array['SET','nx','v2','NX']), 'null', 'SET NX on existing → null');
select tests.eq(tests.run(array['GET','nx']), '"v"', 'SET NX did not overwrite');
select tests.eq(tests.run(array['SET','nx','v2','XX']), '"OK"', 'SET XX on existing');
select tests.eq(tests.run(array['SET','xx','v','XX']), 'null', 'SET XX on missing → null');
select tests.eq(tests.run(array['GET','nx']), '"v2"', 'SET XX overwrote');

-- SET GET
select tests.eq(tests.run(array['SET','gs','a']), '"OK"', 'SET gs a');
select tests.eq(tests.run(array['SET','gs','b','GET']), '"a"', 'SET GET returns old');

-- SET EX → TTL seconds, then PTTL/TTL
select tests.eq(tests.run(array['SET','exp','v','EX','100']), '"OK"', 'SET EX');
select tests.true((tests.run(array['PTTL','exp']))::int > 0, 'PTTL positive after SET EX');
select tests.true((tests.run(array['TTL','exp']))::int between 90 and 100, 'TTL in range');

-- SETNX / SETEX / PSETEX / GETSET / GETDEL
select tests.eq(tests.run(array['SETNX','snx','x']), '1', 'SETNX new → 1');
select tests.eq(tests.run(array['SETNX','snx','y']), '0', 'SETNX existing → 0');
select tests.eq(tests.run(array['SETEX','sex','50','v']), '"OK"', 'SETEX');
select tests.eq(tests.run(array['PSETEX','psex','50000','v']), '"OK"', 'PSETEX');
select tests.eq(tests.run(array['GETSET','g','old']), 'null', 'GETSET missing → null');
select tests.eq(tests.run(array['GETSET','g','new']), '"old"', 'GETSET returns old');
select tests.eq(tests.run(array['GETDEL','g']), '"new"', 'GETDEL returns value');
select tests.eq(tests.run(array['GET','g']), 'null', 'GETDEL removed key');

-- MGET / MSET / MSETNX
select tests.run(array['SET','m1','a']);
select tests.run(array['SET','m2','b']);
select tests.eq(tests.run(array['MGET','m1','m2','nope']), '["a","b",null]', 'MGET mixed');
select tests.eq(tests.run(array['MSET','k1','1','k2','2']), '"OK"', 'MSET');
select tests.eq(tests.run(array['MGET','k1','k2']), '["1","2"]', 'MGET after MSET');
select tests.eq(tests.run(array['MSETNX','n1','a','n2','b']), '1', 'MSETNX new → 1');
select tests.eq(tests.run(array['MSETNX','n1','x','n3','c']), '0', 'MSETNX with one existing → 0');
select tests.eq(tests.run(array['GET','n3']), 'null', 'MSETNX atomic: n3 not set');

-- INCR / DECR / INCRBY / DECRBY
select tests.eq(tests.run(array['INCR','ctr']), '1', 'INCR from missing → 1');
select tests.eq(tests.run(array['INCR','ctr']), '2', 'INCR → 2');
select tests.eq(tests.run(array['DECR','ctr']), '1', 'DECR → 1');
select tests.eq(tests.run(array['INCRBY','ctr','10']), '11', 'INCRBY 10');
select tests.eq(tests.run(array['DECRBY','ctr','5']), '6', 'DECRBY 5');

-- INCR error paths
select tests.run(array['SET','notint','abc']);
select tests.raises(array['INCR','notint'], 'ERR value is not an integer or out of range', 'INCR on non-int');
select tests.raises(array['INCRBY','ctr','x'], 'ERR value is not an integer or out of range', 'INCRBY non-int');

-- INCRBYFLOAT
select tests.eq(tests.run(array['INCRBYFLOAT','f','1.5']), '"1.5"', 'INCRBYFLOAT → 1.5');
select tests.eq(tests.run(array['INCRBYFLOAT','f','1.5']), '"3"', 'INCRBYFLOAT integral prints without decimal');

-- APPEND / STRLEN
select tests.eq(tests.run(array['APPEND','ap','foo']), '3', 'APPEND new → 3');
select tests.eq(tests.run(array['APPEND','ap','bar']), '6', 'APPEND → 6');
select tests.eq(tests.run(array['GET','ap']), '"foobar"', 'APPEND concatenated');
select tests.eq(tests.run(array['STRLEN','ap']), '6', 'STRLEN → 6');
select tests.eq(tests.run(array['STRLEN','missing']), '0', 'STRLEN missing → 0');

-- WRONGTYPE
select tests.run(array['LPUSH','wt','a']);
select tests.raises(array['GET','wt'], 'WRONGTYPE Operation against a key holding the wrong kind of value', 'GET on list → WRONGTYPE');

