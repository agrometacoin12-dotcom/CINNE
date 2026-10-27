-- Run only against an isolated migrated database. All fixtures roll back.
BEGIN;
DO $$
DECLARE u uuid := gen_random_uuid(); p uuid := gen_random_uuid(); t uuid := gen_random_uuid(); w uuid := gen_random_uuid(); n bigint; q uuid := gen_random_uuid();
BEGIN
 INSERT INTO users(id,email,status,email_verified,updated_at,password_hash) VALUES(u,'alerts@example.test','ACTIVE',true,now(),'oldhash');
 IF (SELECT count(*) FROM email_alerts WHERE event_key='users:'||u||':welcome')<>1 THEN RAISE EXCEPTION 'welcome missing'; END IF;
 INSERT INTO producers(id,email,key_hash,key_issued_at,updated_at) VALUES(p,'producer@example.test',p::text,now(),now());
 INSERT INTO catalogue_titles(id,type,title,overview,year,updated_at,status,video_key) VALUES(t,'MOVIE','Alert test film','Test',2026,now(),'DRAFT','movies/test.mp4');
 INSERT INTO producer_titles(title_id,producer_id) VALUES(t,p);
 UPDATE catalogue_titles SET status='PUBLISHED',updated_at=now()+interval '1 second' WHERE id=t;
 IF NOT EXISTS(SELECT 1 FROM email_alerts WHERE recipient='producer@example.test' AND subject='Movie published — CinneTemple') THEN RAISE EXCEPTION 'publication missing'; END IF;
 SELECT count(*) INTO n FROM email_alerts;
 UPDATE catalogue_titles SET title='Alert test film' WHERE id=t;
 IF (SELECT count(*) FROM email_alerts)<>n THEN RAISE EXCEPTION 'no-op produced duplicate'; END IF;
 INSERT INTO purchases(id,user_id,beneficiary_user_id,title_id,title_name,amount_minor,provider,status) VALUES(q,u,u,t,'Alert test film',50000,'COINS','PAID');
 IF (SELECT count(*) FROM email_alerts WHERE event_key='purchases:'||q||':PAID')<>2 THEN RAISE EXCEPTION 'ticket alerts missing'; END IF;
 SELECT count(*) INTO n FROM email_alerts;
 UPDATE purchases SET status='PAID' WHERE id=q;
 INSERT INTO purchases(id,user_id,beneficiary_user_id,title_id,title_name,amount_minor,provider,status) VALUES(gen_random_uuid(),u,u,t,'Simulated film',0,'MOCK','PAID');
 IF (SELECT count(*) FROM email_alerts)<>n THEN RAISE EXCEPTION 'duplicate or sandbox receipt'; END IF;
 UPDATE purchases SET status='REFUNDED' WHERE id=q;
 INSERT INTO coin_ledger(id,user_id,kind,delta,balance_after,idempotency_key) VALUES(gen_random_uuid(),u,'TOPUP',500,500,'test-real-credit');
 IF NOT EXISTS(SELECT 1 FROM email_alerts WHERE subject='Coin top-up confirmed — CinneTemple') THEN RAISE EXCEPTION 'top-up receipt missing'; END IF;
 INSERT INTO coin_topups(id,user_id,coins,amount_minor,provider,reference,status) VALUES(gen_random_uuid(),u,500,50000,'MOCK','mock-credit','PAID');
 SELECT count(*) INTO n FROM email_alerts;
 INSERT INTO coin_ledger(id,user_id,kind,delta,balance_after,idempotency_key) VALUES(gen_random_uuid(),u,'TOPUP',500,1000,'topup:mock-credit');
 IF (SELECT count(*) FROM email_alerts)<>n THEN RAISE EXCEPTION 'mock wallet receipt'; END IF;
 INSERT INTO producer_withdrawals(id,producer_id,amount_minor,bank_name,account_number,account_name,status) VALUES(w,p,100000,'Test Bank','0123456789','Producer','REQUESTED');
 UPDATE producer_withdrawals SET status='PAID' WHERE id=w;
 IF (SELECT count(*) FROM email_alerts WHERE event_key='producer_withdrawals:'||w||':REQUESTED')<>2 THEN RAISE EXCEPTION 'withdrawal admin/user alert missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM email_alerts WHERE event_key='producer_withdrawals:'||w||':PAID') THEN RAISE EXCEPTION 'paid alert missing'; END IF;
 IF EXISTS(SELECT 1 FROM email_alerts WHERE body LIKE '%0123456789%') THEN RAISE EXCEPTION 'bank detail leakage'; END IF;
 UPDATE users SET password_hash='newhash',updated_at=now()+interval '1 second' WHERE id=u;
 IF NOT EXISTS(SELECT 1 FROM email_alerts WHERE subject='Your CinneTemple password changed') THEN RAISE EXCEPTION 'security alert missing'; END IF;
 SELECT count(*) INTO n FROM email_alerts;
 BEGIN
   INSERT INTO coin_ledger(id,user_id,kind,delta,balance_after,idempotency_key) VALUES(gen_random_uuid(),u,'TRANSFER_IN',1,1001,'rollback-alert');
   RAISE EXCEPTION 'force rollback';
 EXCEPTION WHEN OTHERS THEN NULL;
 END;
 IF (SELECT count(*) FROM email_alerts)<>n THEN RAISE EXCEPTION 'rolled-back event leaked'; END IF;
 PERFORM ct_queue_mail('dedupe','alerts@example.test','Subject','Body');
 PERFORM ct_queue_mail('dedupe','alerts@example.test','Subject','Body');
 IF (SELECT count(*) FROM email_alerts WHERE event_key='dedupe')<>1 THEN RAISE EXCEPTION 'outbox dedupe failed'; END IF;
 RAISE NOTICE 'Email trigger checks passed';
END $$;
ROLLBACK;
