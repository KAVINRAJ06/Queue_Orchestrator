
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_demo_project(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_demo_project(TEXT) TO authenticated;
