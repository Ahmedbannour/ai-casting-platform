-- Photos et documents servis par la même origine que l'application (/casting-media/...),
-- et non plus directement par MinIO (http://localhost:9000/...), que certains navigateurs bloquent.
update actor_photos set url = regexp_replace(url, '^https?://[^/]+/casting-media/', '/casting-media/')
 where url ~ '^https?://[^/]+/casting-media/';
update actor_photos set thumbnail_url = regexp_replace(thumbnail_url, '^https?://[^/]+/casting-media/', '/casting-media/')
 where thumbnail_url ~ '^https?://[^/]+/casting-media/';
update actor_documents set url = regexp_replace(url, '^https?://[^/]+/casting-media/', '/casting-media/')
 where url ~ '^https?://[^/]+/casting-media/';
