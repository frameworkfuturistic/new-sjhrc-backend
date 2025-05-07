# TimeZone issue
-- Check global and session timezones
SELECT @@global.time_zone, @@session.time_zone;

-- Check system timezone (the server's OS timezone)
SELECT @@system_time_zone;

-- Check current timestamps in different formats
SELECT NOW(), UTC_TIMESTAMP(), UNIX_TIMESTAMP();