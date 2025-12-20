import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zknhnivznhifhhpexipy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprbmhuaXZ6bmhpZmhocGV4aXB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxOTYwODQsImV4cCI6MjA4MTc3MjA4NH0.upqkbcP8BQZhitKSkOpLRcGuwB4mwi9JcrlVWJUCpb8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
