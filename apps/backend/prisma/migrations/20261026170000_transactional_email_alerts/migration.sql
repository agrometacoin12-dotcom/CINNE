-- Only future committed transitions create alerts; no historical backfill.
CREATE TABLE email_alerts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_key text NOT NULL, recipient text NOT NULL,
 subject text NOT NULL, body text NOT NULL, status text NOT NULL DEFAULT 'PENDING',
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 first_attempt_at timestamptz, lease_token uuid, accepted_at timestamptz,
 last_error text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_key, recipient)
);
CREATE INDEX email_alerts_pending_idx ON email_alerts(status, available_at);
CREATE FUNCTION ct_queue_mail(k text, r text, s text, b text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO email_alerts(event_key,recipient,subject,body)
 SELECT k, lower(trim(r)), s, b WHERE r IS NOT NULL AND length(trim(r)) > 3
 ON CONFLICT (event_key,recipient) DO NOTHING;
$$;
CREATE FUNCTION ct_email_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text; r text; t text; b text; s text; pid uuid;
BEGIN
 k := TG_TABLE_NAME || ':' || NEW.id::text;
 IF TG_TABLE_NAME = 'users' THEN
   IF TG_OP = 'INSERT' AND NEW.status::text = 'ACTIVE' THEN
     PERFORM ct_queue_mail(k || ':welcome', NEW.email, 'Welcome to CinneTemple', 'Your CinneTemple account is ready. Sign in to explore movies: https://www.cinnetemple.com');
   ELSIF TG_OP = 'UPDATE' THEN
     IF OLD.status::text = 'PENDING_VERIFICATION' AND NEW.status::text = 'ACTIVE' THEN
       PERFORM ct_queue_mail(k || ':welcome', NEW.email, 'Welcome to CinneTemple', 'Your CinneTemple account is ready. Sign in at https://www.cinnetemple.com');
     END IF;
     IF OLD.password_hash IS NOT NULL AND NEW.password_hash IS DISTINCT FROM OLD.password_hash AND NEW.deleted_at IS NULL THEN
       PERFORM ct_queue_mail(k || ':password:' || NEW.updated_at::text, NEW.email, 'Your CinneTemple password changed', 'Your account password was changed. If this was not you, reset your password immediately through the CinneTemple app and contact support.');
     END IF;
   END IF;
 ELSIF TG_TABLE_NAME = 'producers' THEN
   PERFORM ct_queue_mail(k, NEW.email, 'Welcome to CinneTemple for producers', 'Your producer profile is ready. Sign in with your registered email at https://www.cinnetemple.com/producer/register/ to view your films and earnings. Movie assignments and revenue shares will appear in your dashboard.');
   PERFORM ct_queue_mail(k, '@admins', 'New CinneTemple producer', 'A producer profile was created. Review it in the producer administration dashboard. Producer ID: ' || NEW.id::text);
 ELSIF TG_TABLE_NAME = 'catalogue_titles' THEN
   IF TG_OP = 'INSERT' THEN
     s := 'Movie details saved';
   ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
     s := CASE WHEN NEW.status::text = 'PUBLISHED' THEN 'Movie published' ELSE 'Movie moved to draft' END;
   ELSIF NEW.video_key IS DISTINCT FROM OLD.video_key THEN
     s := CASE WHEN NEW.video_key IS NOT NULL THEN 'Movie upload attached' ELSE 'Movie video removed' END;
   ELSE RETURN NEW;
   END IF;
   b := NEW.title || E'
Catalogue status: ' || NEW.status::text || E'
Video attached: ' || CASE WHEN NEW.video_key IS NULL THEN 'No' ELSE 'Yes' END || E'
Review the movie details and playback in CinneTemple Studio. Attaching a file does not by itself confirm successful playback.';
   SELECT p.email INTO r FROM producer_titles pt JOIN producers p ON p.id=pt.producer_id WHERE pt.title_id=NEW.id;
   PERFORM ct_queue_mail(k || ':' || NEW.updated_at::text, r, s || ' — CinneTemple', b);
   PERFORM ct_queue_mail(k || ':' || NEW.updated_at::text, '@admins', s || ' — CinneTemple', b);
 ELSIF TG_TABLE_NAME = 'episodes' THEN
   IF TG_OP = 'UPDATE' AND NEW.video_key IS NOT DISTINCT FROM OLD.video_key THEN RETURN NEW; END IF;
   SELECT p.email INTO r FROM producer_titles pt JOIN producers p ON p.id=pt.producer_id WHERE pt.title_id=NEW.title_id;
   b := 'Episode: ' || NEW.name || E'
Video attached: ' || CASE WHEN NEW.video_key IS NULL THEN 'No' ELSE 'Yes' END || E'
Check episode details and playback in CinneTemple Studio.';
   PERFORM ct_queue_mail(k || ':' || NEW.updated_at::text, r, 'Episode upload updated — CinneTemple', b);
   PERFORM ct_queue_mail(k || ':' || NEW.updated_at::text, '@admins', 'Episode upload updated — CinneTemple', b);
 ELSIF TG_TABLE_NAME = 'coin_ledger' THEN
   IF NEW.kind::text = 'TICKET_PURCHASE' THEN RETURN NEW; END IF;
   IF NEW.kind::text = 'TOPUP' AND EXISTS (SELECT 1 FROM coin_topups WHERE 'topup:' || reference = NEW.idempotency_key AND provider::text='MOCK') THEN RETURN NEW; END IF;
   SELECT email INTO r FROM users WHERE id=NEW.user_id AND deleted_at IS NULL AND status::text='ACTIVE';
   s := CASE NEW.kind::text WHEN 'TOPUP' THEN 'Coin top-up confirmed' WHEN 'TRANSFER_IN' THEN 'Coins received' WHEN 'TRANSFER_OUT' THEN 'Coins sent' WHEN 'APPLE_REFUND' THEN 'Apple purchase refund applied' WHEN 'APPLE_REFUND_REVERSAL' THEN 'Apple refund reversed' WHEN 'POOL_FUND' THEN 'Film funding confirmed' WHEN 'POOL_REFUND' THEN 'Film funding refund' WHEN 'POOL_PAYOUT' THEN 'Film funding payout credited' ELSE 'Coin wallet activity' END;
   b := 'Wallet change: ' || NEW.delta::text || E' coins
Balance after this transaction: ' || NEW.balance_after::text || E' coins
Reference: ' || NEW.id::text || E'
Open your CinneTemple wallet for full transaction details.';
   PERFORM ct_queue_mail(k,r,s || ' — CinneTemple',b);
 ELSIF TG_TABLE_NAME = 'coin_topups' THEN
   IF NEW.provider::text='MOCK' OR NEW.status::text <> 'FAILED' THEN RETURN NEW; END IF;
   IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
   SELECT email INTO r FROM users WHERE id=NEW.user_id AND deleted_at IS NULL;
   PERFORM ct_queue_mail(k || ':failed',r,'Coin top-up unsuccessful — CinneTemple','This top-up was not credited. Check your wallet and payment status before retrying. Reference: ' || NEW.reference);
 ELSIF TG_TABLE_NAME = 'purchases' THEN
   IF NEW.provider::text='MOCK' OR NEW.status::text='PENDING' THEN RETURN NEW; END IF;
   IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
   SELECT email INTO r FROM users WHERE id=NEW.user_id AND deleted_at IS NULL;
   s := CASE NEW.status::text WHEN 'PAID' THEN 'Movie ticket confirmed' WHEN 'REFUNDED' THEN 'Movie ticket refunded' ELSE 'Movie ticket payment unsuccessful' END;
   b := NEW.title_name || E'
Status: ' || NEW.status::text || E'
Reference: ' || NEW.id::text || E'
Open CinneTemple to check your tickets and viewing access.';
   PERFORM ct_queue_mail(k || ':' || NEW.status::text,r,s || ' — CinneTemple',b);
   IF NEW.is_gift AND NEW.beneficiary_user_id <> NEW.user_id THEN
     SELECT email INTO r FROM users WHERE id=NEW.beneficiary_user_id AND deleted_at IS NULL;
     PERFORM ct_queue_mail(k || ':' || NEW.status::text,r,'Gift ticket update — CinneTemple',b);
   END IF;
   IF NEW.status::text IN ('PAID','REFUNDED') THEN
     SELECT p.email INTO r FROM producer_titles pt JOIN producers p ON p.id=pt.producer_id WHERE pt.title_id=NEW.title_id;
     PERFORM ct_queue_mail(k || ':' || NEW.status::text,r,'Movie ticket activity — CinneTemple',NEW.title_name || E'
A ticket transaction is now ' || NEW.status::text || '. Open your producer dashboard for the earnings breakdown. Pending settlements and deductions may affect withdrawable earnings.');
   END IF;
 ELSIF TG_TABLE_NAME = 'producer_withdrawals' THEN
   IF NEW.status::text NOT IN ('REQUESTED','PAID','REJECTED','EXPIRED') THEN RETURN NEW; END IF;
   IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
   SELECT email INTO r FROM producers WHERE id=NEW.producer_id;
   s := CASE NEW.status::text WHEN 'REQUESTED' THEN 'Withdrawal submitted for review' WHEN 'PAID' THEN 'Withdrawal marked paid' WHEN 'REJECTED' THEN 'Withdrawal declined' ELSE 'Withdrawal confirmation expired' END;
   b := 'Amount: NGN ' || (NEW.amount_minor::numeric/100)::text || E'
Status: ' || NEW.status::text || E'
Reference: ' || NEW.id::text || E'
Check your producer dashboard for details. A submitted request is not a completed payout.';
   PERFORM ct_queue_mail(k || ':' || NEW.status::text,r,s || ' — CinneTemple',b);
   IF NEW.status::text='REQUESTED' THEN PERFORM ct_queue_mail(k || ':REQUESTED','@admins','Producer withdrawal awaiting review',b); END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER users_email_alert AFTER INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION ct_email_event();
CREATE TRIGGER producers_email_alert AFTER INSERT ON producers FOR EACH ROW EXECUTE FUNCTION ct_email_event();
CREATE TRIGGER catalogue_titles_email_alert AFTER INSERT OR UPDATE ON catalogue_titles FOR EACH ROW EXECUTE FUNCTION ct_email_event();
CREATE TRIGGER episodes_email_alert AFTER INSERT OR UPDATE ON episodes FOR EACH ROW EXECUTE FUNCTION ct_email_event();
CREATE TRIGGER coin_ledger_email_alert AFTER INSERT ON coin_ledger FOR EACH ROW EXECUTE FUNCTION ct_email_event();
CREATE TRIGGER coin_topups_email_alert AFTER INSERT OR UPDATE ON coin_topups FOR EACH ROW EXECUTE FUNCTION ct_email_event();
CREATE TRIGGER purchases_email_alert AFTER INSERT OR UPDATE ON purchases FOR EACH ROW EXECUTE FUNCTION ct_email_event();
CREATE TRIGGER producer_withdrawals_email_alert AFTER INSERT OR UPDATE ON producer_withdrawals FOR EACH ROW EXECUTE FUNCTION ct_email_event();

-- Assignment email failures must remain visible after ownership has committed.
CREATE FUNCTION ct_producer_email_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.action='producer.assigned' AND NEW.metadata->>'dashboardEmailSent'='false' THEN
   PERFORM ct_queue_mail('producer-email-failure:' || NEW.id::text,'@admins','Producer dashboard email needs attention',
     'The movie assignment was saved, but the private dashboard email failed. Use Resend producer link in Studio to issue a new link. Title ID: ' || COALESCE(NEW.entity_id,''));
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER producer_email_failure AFTER INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION ct_producer_email_failure();
