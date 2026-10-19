export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const source = url.searchParams.get('source');

  if (!source) {
    return new Response(JSON.stringify({ error: 'Missing source query parameter' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  let sourceUrl;
  try {
    sourceUrl = new URL(source);
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid source URL' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  if (!['http:', 'https:'].includes(sourceUrl.protocol)) {
    return new Response(JSON.stringify({ error: 'Only HTTP and HTTPS sources are allowed' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    const upstreamResponse = await fetch(sourceUrl, {
      headers: {
        Accept: 'text/csv,application/json,text/plain,*/*',
      },
      redirect: 'follow',
      cache: 'no-store',
    });

    if (!upstreamResponse.ok) {
      return new Response(JSON.stringify({ error: 'Source fetch failed' }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const contentType = upstreamResponse.headers.get('content-type') || 'text/csv; charset=utf-8';
    const body = await upstreamResponse.text();

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Source fetch failed', details: String(error) }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
