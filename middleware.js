import { NextResponse } from 'next/server';

function buildExpectedAuthorizationHeader() {
  const dashboard_user = process.env.DASHBOARD_USER || '';
  const dashboard_password = process.env.DASHBOARD_PASSWORD || '';
  if (!dashboard_user || !dashboard_password) return null;
  return `Basic ${btoa(`${dashboard_user}:${dashboard_password}`)}`;
}

export function middleware(request) {
  const expected_authorization_header = buildExpectedAuthorizationHeader();

  if (!expected_authorization_header) {
    return new NextResponse(
      'Dashboard credentials are not configured. Set DASHBOARD_USER and DASHBOARD_PASSWORD environment variables.',
      { status: 503 }
    );
  }

  if (request.headers.get('authorization') === expected_authorization_header) {
    return NextResponse.next();
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Gahanga House Dashboard"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
