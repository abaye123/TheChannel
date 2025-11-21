import { Parser, Token, Tokens, TokensList } from "marked";
import { MarkdownModuleConfig, MARKED_OPTIONS, MarkedRenderer } from "ngx-markdown";

const matchCustomEmbedRegEx = /^\[(video|audio|image)-embedded#]\((.*?)\)/;
const matchYoutubeRegEx = /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/|shorts\/)?)(?<id>[\w\-]+)(\S+)?$/;

const customEmbedExtension = {
  extensions: [{
    name: 'custom_embed',
    level: 'inline',
    start: (src: string) => src.match(matchCustomEmbedRegEx)?.index ?? src.match(matchYoutubeRegEx)?.index,
    tokenizer: (src: string, tokens: Token[] | TokensList) => {
      let match = src.match(matchCustomEmbedRegEx);
      if (match) {
        return {
          type: 'custom_embed',
          raw: match[0],
          meta: { type: match[1], url: match[2] },
        };
      }

      match = src.match(matchYoutubeRegEx);
      if (match && match.groups?.['id']) {
        const isShorts = match[0].includes('/shorts/');
        return {
          type: 'custom_embed',
          raw: match[0],
          meta: {
            type: 'youtube',
            id: match.groups['id'],
            isShorts: isShorts
          },
        };
      }

      return undefined;
    },
    renderer: (token: Tokens.Generic) => {
      const { type, url, id, isShorts } = token['meta'];
      switch (type) {
        case 'video':
          return `<div style="max-width: 300px; height: auto;"><video controls style="width: 100%; height: auto;"><source src="${url}" type="video/mp4"></video></div>`;
        case 'audio':
          return `<div><audio src="${url}" controls></audio></div>`;
        case 'image':
          return `<div style="max-width: 300px; height: auto;"><img src="${url}" class="img-fluid" width="300px"></div>`;
        case 'youtube':
          const containerStyle = isShorts
            ? 'position: relative; max-width: 200px; height: auto;'
            : 'position: relative; max-width: 300px; height: auto;';
          const imgStyle = isShorts
            ? 'width: 100%; aspect-ratio: 9/16; object-fit: cover;'
            : 'width: 100%;';

          // Different icons for Shorts vs regular videos
          if (isShorts) {
            // YouTube Shorts icon (Official SVG)
            return `<div style="${containerStyle}; position: relative; display: inline-block;">
              <img youtubeid="${id}" isshorts="true" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" class="img-fluid" style="${imgStyle}; display: block;">
              <svg youtubeid="${id}" isshorts="true" 
                style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 50px; height: 50px; cursor: pointer; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));" 
                viewBox="0 0 98.94 122.88" 
                  xmlns="http://www.w3.org/2000/svg">
                <path d="M63.49 2.71c11.59-6.04 25.94-1.64 32.04 9.83 6.1 11.47 1.65 25.66-9.94 31.7l-9.53 5.01c8.21.3 16.04 4.81 20.14 12.52 6.1 11.47 1.66 25.66-9.94 31.7l-50.82 26.7c-11.59 6.04-25.94 1.64-32.04-9.83-6.1-11.47-1.65-25.66 9.94-31.7l9.53-5.01c-8.21-.3-16.04-4.81-20.14-12.52-6.1-11.47-1.65-25.66 9.94-31.7l50.82-26.7zM36.06 42.53l30.76 18.99-30.76 18.9V42.53z" fill="#f40407"/>
                <path d="M36.06,42.53 V 80.42 L 66.82,61.52Z" fill="#fff"/>
              </svg>
            </div>`;
          } else {
            // Regular YouTube icon
            const iconStyle = 'position: absolute; place-self: anchor-center; color: red; font-size: 70px;';
            return `<div style="${containerStyle}">
              <img youtubeid="${id}" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" class="img-fluid" style="${imgStyle}">
              <i class="bi bi-youtube" youtubeid="${id}" style="${iconStyle}"></i>
            </div>`;
          }
        default:
          return '';
      }
    }
  }]
}

const renderer = new MarkedRenderer();

renderer.link = ({ href, title, text }: { href: string; title?: string | null; text: string }) => {
  const titleAttr = title ? ` title="${title}"` : '';
  return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};

export const MarkdownConfig: MarkdownModuleConfig = {
  markedExtensions: [customEmbedExtension],
  markedOptions: {
    provide: MARKED_OPTIONS,
    useValue: {
      renderer: renderer,
      breaks: true,
    },
  }
}
