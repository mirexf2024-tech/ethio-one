-- 1. ETHIO ID Profiles Table
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  ethio_id_code text unique not null,
  full_name text not null,
  phone_or_email text not null,
  avatar_url text default '',
  preferred_lang text default 'om',
  created_at timestamptz default now()
);

-- 2. ETHIO JOBS Table
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  posted_by_ethio_id text references profiles(ethio_id_code) on delete set null,
  title text not null,
  company text not null,
  location text default 'Ethiopia',
  description text not null,
  job_banner_url text default '',
  status text default 'open',
  created_at timestamptz default now()
);

-- 3. ETHIO SERVICE Table
create table if not exists services_listings (
  id uuid primary key default gen_random_uuid(),
  provider_ethio_id text references profiles(ethio_id_code) on delete set null,
  service_category text not null,
  service_name text not null,
  description text not null,
  price_info text default '',
  location text default 'Ethiopia',
  sample_image_url text default '',
  created_at timestamptz default now()
);

-- 4. ETHIO LEARNING Table
create table if not exists learning_courses (
  id uuid primary key default gen_random_uuid(),
  instructor_ethio_id text references profiles(ethio_id_code) on delete set null,
  title text not null,
  level text default 'beginner',
  summary text not null,
  thumbnail_url text default '',
  resource_url text default '',
  created_at timestamptz default now()
);
