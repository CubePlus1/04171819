export default function Postcard({ postcard }) {
  if (!postcard) return null;
  const { heading, body, highlight, closing, creator } = postcard;

  let highlightBlock = null;
  if (highlight) {
    if (highlight.name && highlight.price) {
      highlightBlock = (
        <div className="highlight">
          <div>{highlight.name}</div>
          <div><strong>{highlight.price}</strong></div>
        </div>
      );
    } else if (highlight.note) {
      highlightBlock = (
        <div className="highlight"><strong>{highlight.note}</strong></div>
      );
    }
  }

  return (
    <article className="postcard" role="group" aria-label="履约型明信片">
      <h3>{heading}</h3>
      <div className="body">{body}</div>
      {highlightBlock}
      <div className="closing">{closing}</div>
      <div className="from">— 来自 {creator} · 与你有关</div>
    </article>
  );
}
