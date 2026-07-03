
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile write" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all projects" ON public.projects FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Queues
CREATE TYPE public.retry_policy AS ENUM ('fixed','linear','exponential');
CREATE TYPE public.priority_level AS ENUM ('low','medium','high');

CREATE TABLE public.queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  concurrency INT NOT NULL DEFAULT 5,
  priority public.priority_level NOT NULL DEFAULT 'medium',
  retry_policy public.retry_policy NOT NULL DEFAULT 'exponential',
  paused BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queues TO authenticated;
GRANT ALL ON public.queues TO service_role;
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "queues via project owner" ON public.queues FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));

-- Workers
CREATE TYPE public.worker_status AS ENUM ('active','idle','dead');
CREATE TABLE public.workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status public.worker_status NOT NULL DEFAULT 'idle',
  current_jobs INT NOT NULL DEFAULT 0,
  max_concurrency INT NOT NULL DEFAULT 10,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workers TO authenticated;
GRANT ALL ON public.workers TO service_role;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workers via project owner" ON public.workers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));

-- Jobs
CREATE TYPE public.job_type AS ENUM ('immediate','scheduled','cron','batch');
CREATE TYPE public.job_state AS ENUM ('queued','scheduled','claimed','running','completed','failed','cancelled','dead');

CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  queue_id UUID NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type public.job_type NOT NULL DEFAULT 'immediate',
  state public.job_state NOT NULL DEFAULT 'queued',
  priority public.priority_level NOT NULL DEFAULT 'medium',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  error TEXT,
  logs TEXT,
  scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_jobs_project_state ON public.jobs(project_id, state);
CREATE INDEX idx_jobs_queue ON public.jobs(queue_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs via project owner" ON public.jobs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));

-- Retry history
CREATE TABLE public.job_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL,
  state public.job_state NOT NULL,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_attempts TO authenticated;
GRANT ALL ON public.job_attempts TO service_role;
ALTER TABLE public.job_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attempts via job owner" ON public.job_attempts FOR ALL
  USING (EXISTS (SELECT 1 FROM public.jobs j JOIN public.projects p ON p.id = j.project_id WHERE j.id = job_id AND p.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j JOIN public.projects p ON p.id = j.project_id WHERE j.id = job_id AND p.owner_id = auth.uid()));

-- Seed function: creates a demo project with queues/workers/jobs for the caller
CREATE OR REPLACE FUNCTION public.seed_demo_project(p_name TEXT DEFAULT 'Demo Project')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_project UUID;
  v_q_default UUID;
  v_q_email UUID;
  v_q_reports UUID;
  v_w1 UUID; v_w2 UUID; v_w3 UUID;
  i INT;
  v_states public.job_state[] := ARRAY['queued','scheduled','running','completed','failed','completed','completed','running','queued','failed']::public.job_state[];
  v_types public.job_type[] := ARRAY['immediate','scheduled','cron','batch']::public.job_type[];
  v_names TEXT[] := ARRAY['send-welcome-email','sync-user-data','generate-report','process-webhook','resize-image','send-invoice','backup-database','index-search','cleanup-sessions','notify-slack'];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.projects (name, description, owner_id) VALUES (p_name, 'Demo scheduler project', v_uid) RETURNING id INTO v_project;
  INSERT INTO public.queues (project_id, name, concurrency, priority, retry_policy) VALUES
    (v_project,'default',10,'medium','exponential') RETURNING id INTO v_q_default;
  INSERT INTO public.queues (project_id, name, concurrency, priority, retry_policy) VALUES
    (v_project,'emails',5,'high','linear') RETURNING id INTO v_q_email;
  INSERT INTO public.queues (project_id, name, concurrency, priority, retry_policy) VALUES
    (v_project,'reports',3,'low','fixed') RETURNING id INTO v_q_reports;

  INSERT INTO public.workers (project_id,name,status,current_jobs,max_concurrency,last_heartbeat_at) VALUES
    (v_project,'worker-alpha','active',3,10, now() - interval '2 seconds') RETURNING id INTO v_w1;
  INSERT INTO public.workers (project_id,name,status,current_jobs,max_concurrency,last_heartbeat_at) VALUES
    (v_project,'worker-beta','idle',0,10, now() - interval '4 seconds') RETURNING id INTO v_w2;
  INSERT INTO public.workers (project_id,name,status,current_jobs,max_concurrency,last_heartbeat_at) VALUES
    (v_project,'worker-gamma','dead',0,10, now() - interval '5 minutes') RETURNING id INTO v_w3;

  FOR i IN 1..40 LOOP
    INSERT INTO public.jobs (project_id, queue_id, worker_id, name, type, state, priority, payload, attempts, max_attempts, error, logs, created_at, started_at, finished_at, scheduled_for)
    VALUES (
      v_project,
      (ARRAY[v_q_default,v_q_email,v_q_reports])[1 + (i % 3)],
      CASE WHEN i % 4 = 0 THEN v_w1 WHEN i % 4 = 1 THEN v_w2 ELSE NULL END,
      v_names[1 + (i % 10)] || '-#' || i,
      v_types[1 + (i % 4)],
      v_states[1 + (i % 10)],
      (ARRAY['low','medium','high']::public.priority_level[])[1 + (i % 3)],
      jsonb_build_object('user_id', gen_random_uuid(), 'index', i, 'attempt', i % 5),
      (i % 4),
      3,
      CASE WHEN v_states[1 + (i % 10)] = 'failed' THEN 'ECONNREFUSED: upstream timeout after 30s' ELSE NULL END,
      E'[info] job started\n[info] fetching payload\n[info] processing item ' || i || E'\n[info] step 1 complete\n[info] step 2 complete',
      now() - (i || ' minutes')::interval,
      CASE WHEN v_states[1 + (i % 10)] IN ('running','completed','failed') THEN now() - ((i-1) || ' minutes')::interval ELSE NULL END,
      CASE WHEN v_states[1 + (i % 10)] IN ('completed','failed') THEN now() - ((i-2) || ' minutes')::interval ELSE NULL END,
      CASE WHEN v_states[1 + (i % 10)] = 'scheduled' THEN now() + (i || ' minutes')::interval ELSE NULL END
    );
  END LOOP;

  RETURN v_project;
END; $$;
GRANT EXECUTE ON FUNCTION public.seed_demo_project(TEXT) TO authenticated;
