const GOOGLE_API_URL =
  'https://script.google.com/macros/s/AKfycbxm8Coaag74XYTrn1wM1WkS2bIlMOJjiBJsQWHwR53sd6jWoefskvekoeieNjcVVzo/exec?api=1';

export default async function handler(request, response) {
  try {
    const googleResponse = await fetch(GOOGLE_API_URL, {
      redirect: 'follow',
      headers: {
        Accept: 'application/json'
      }
    });

    if (!googleResponse.ok) {
      throw new Error(
        `Google API returned status ${googleResponse.status}`
      );
    }

    const data = await googleResponse.json();

    response.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate'
    );

    return response.status(200).json(data);
  } catch (error) {
    return response.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to load leaderboard.',
      players: [],
      updatedAt: new Date().toISOString(),
      refreshSeconds: 15
    });
  }
}