function clamp(x, min, max) {
  return Math.min(max, Math.max(x, min));
}

function mod(x, n) {
  return ((x % n) + n) % n;
}

function copyPixelNearest(read, write) {
  const {width, height, data} = read;
  const readIndex = (x, y) => 4 * (y * width + x);

  return (xFrom, yFrom, to) => {

    const nearest = readIndex(
      clamp(Math.round(xFrom), 0, width - 1),
      clamp(Math.round(yFrom), 0, height - 1)
    );

    for (let channel = 0; channel < 4; channel++) {
      write.data[to + channel] = data[nearest + channel];
    }
  };
}

function copyPixelBilinear(read, write) {
  const {width, height, data} = read;
  const readIndex = (x, y) => 4 * (y * width + x);

  return (xFrom, yFrom, to) => {
    const xl = clamp(Math.floor(xFrom), 0, width - 1);
    const xr = clamp(Math.ceil(xFrom), 0, width - 1);
    const xf = xFrom - xl;

    const yl = clamp(Math.floor(yFrom), 0, height - 1);
    const yr = clamp(Math.ceil(yFrom), 0, height - 1);
    const yf = yFrom - yl;

    const p00 = readIndex(xl, yl);
    const p10 = readIndex(xr ,yl);
    const p01 = readIndex(xl, yr);
    const p11 = readIndex(xr, yr);

    for (let channel = 0; channel < 4; channel++) {
      const p0 = data[p00 + channel] * (1 - xf) + data[p10 + channel] * xf;
      const p1 = data[p01 + channel] * (1 - xf) + data[p11 + channel] * xf;
      write.data[to + channel] = Math.ceil(p0 * (1 - yf) + p1 * yf);
    }
  };
}

// performs a discrete convolution with a provided kernel
function kernelResample(read, write, filterSize, kernel) {
  const {width, height, data} = read;
  const readIndex = (x, y) => 4 * (y * width + x);

  const twoFilterSize = 2*filterSize;
  const xMax = width - 1;
  const yMax = height - 1;
  const xKernel = new Array(4);
  const yKernel = new Array(4);

  return (xFrom, yFrom, to) => {
    const xl = Math.floor(xFrom);
    const yl = Math.floor(yFrom);
    const xStart = xl - filterSize + 1;
    const yStart = yl - filterSize + 1;

    for (let i = 0; i < twoFilterSize; i++) {
      xKernel[i] = kernel(xFrom - (xStart + i));
      yKernel[i] = kernel(yFrom - (yStart + i));
    }

    for (let channel = 0; channel < 4; channel++) {
      let q = 0;

      for (let i = 0; i < twoFilterSize; i++) {
        const y = yStart + i;
        const yClamped = clamp(y, 0, yMax);
        let p = 0;
        for (let j = 0; j < twoFilterSize; j++) {
          const x = xStart + j;
          const index = readIndex(clamp(x, 0, xMax), yClamped);
          p += data[index + channel] * xKernel[j];

        }
        q += p * yKernel[i];
      }

      write.data[to + channel] = Math.round(q);
    }
  };
}

function copyPixelBicubic(read, write) {
  const b = -0.5;
  const kernel = x => {
    x = Math.abs(x);
    const x2 = x*x;
    const x3 = x*x*x;
    return x <= 1 ?
      (b + 2)*x3 - (b + 3)*x2 + 1 :
      b*x3 - 5*b*x2 + 8*b*x - 4*b;
  };

  return kernelResample(read, write, 2, kernel);
}

function copyPixelLanczos(read, write) {
  const filterSize = 5;
  const kernel = x => {
    if (x === 0) {
      return 1;
    }
    else {
      const xp = Math.PI * x;
      return filterSize * Math.sin(xp) * Math.sin(xp / filterSize) / (xp * xp);
    }
  };

  return kernelResample(read, write, filterSize, kernel);
}

// Given a pixel on the MBU texture, where should it look in the MBG texture?
function mapMbgToMbu(x, y) {
  x *= 2;
  const leftSide = x < 1;
  if (!leftSide)
    x -= 1;
  x = 2 * x - 1;
  y = 2 * y - 1;
  let dist = Math.sqrt(x * x + y * y);
  //dist *= 1.025
  if (dist > 1.03)
    return [-1, -1];
  else if (dist > 1.0)
    dist = 1.0;
  let ang = Math.atan2(y, x);
  // janky formula idk
  //let distortAng = ang - Math.PI / 2;
  //if (distortAng < -3 * Math.PI / 2)
  //  distortAng += 2 * Math.PI;
  //dist /= 0.97 + 0.03 * (Math.abs(distortAng) / Math.PI)
  if (ang < 0)
    ang += 2 * Math.PI
  let yy = leftSide ? (dist / 2.0) : (1.0 - dist / 2.0);
  let xx = ang / (2 * Math.PI);
  return [xx, yy];
}

// Given a pixel on the MBG texture, where should it look in the MBU texture?
function mapMbuToMbg(x, y) {
  return [1-x, y];
}

function renderFace({data: readData, interpolation, mapping}) {

  const faceWidth = readData.width;
  const faceHeight = readData.height;

  const writeData = new ImageData(faceWidth, faceHeight);

  const copyPixel =
    interpolation === 'linear' ? copyPixelBilinear(readData, writeData) :
    interpolation === 'cubic' ? copyPixelBicubic(readData, writeData) :
    interpolation === 'lanczos' ? copyPixelLanczos(readData, writeData) :
    copyPixelNearest(readData, writeData);

  const mapCoords =
    mapping === 'g2u' ? mapMbgToMbu : mapMbuToMbg;

  for (let x = 0; x < faceWidth; x++) {
    for (let y = 0; y < faceHeight; y++) {
      const to = 4 * (y * faceWidth + x);
      let coords = mapCoords(x / faceWidth, y / faceHeight);

      if (coords[0] >= 0 && coords[1] >= 0) {
        copyPixel(coords[0] * faceWidth, coords[1] * faceHeight, to);
      } else {
        for (let channel = 0; channel < 4; channel++)
          writeData.data[to + channel] = 0;
      }
    }
  }

  postMessage(writeData);
}

onmessage = function({data}) {
  renderFace(data);
};
