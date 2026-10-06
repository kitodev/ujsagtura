create table if not exists routes (id text primary key, name text not null, note text default '');
create table if not exists stops (
  id uuid primary key default gen_random_uuid(),
  route_id text not null references routes(id) on delete cascade,
  position int not null, address text not null, name text default '', note text default '',
  lat double precision, lon double precision);
create table if not exists stop_papers (
  id uuid primary key default gen_random_uuid(),
  ord bigserial,
  stop_id uuid not null references stops(id) on delete cascade, paper text not null);
create table if not exists deliveries (
  stop_paper_id uuid not null references stop_papers(id) on delete cascade,
  day date not null,
  status text not null check (status in ('delivered','missing','cancelled')),
  updated_at timestamptz default now(),
  primary key (stop_paper_id, day));
create index if not exists stops_route_idx on stops(route_id, position);
