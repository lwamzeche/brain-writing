// generateImage.js
export async function generateImage(prompt) {
  const apiKey = process.env.REACT_APP_OPENAI_API_KEY;
  if (!apiKey) {
    console.error("REACT_APP_OPENAI_API_KEY is not set");
    return null;
  }
  try {
    const response = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prompt,
          n: 1,
          size: "256x256",
        }),
      }
    );
    const data = await response.json();
    console.log("API response:", data);
    if (data.data && data.data.length > 0) {
      return data.data[0].url;
    }
    console.error("No image URL returned", data);
    return null;
  } catch (error) {
    console.error("Error generating image:", error);
    return null;
  }
}
