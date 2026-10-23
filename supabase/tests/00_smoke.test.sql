begin;
select plan(2);

select has_schema('public', 'public schema exists');
select has_extension('pgtap', 'pgtap is available');

select * from finish();
rollback;
