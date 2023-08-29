const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

class RadioInput {
  constructor(name, onChange) {
    this.inputs = document.querySelectorAll(`input[name=${name}]`);
    for (let input of this.inputs) {
      input.addEventListener('change', onChange);
    }
  }

  get value() {
    for (let input of this.inputs) {
      if (input.checked) {
        return input.value;
      }
    }
  }
}

class Input {
  constructor(id, onChange) {
    this.input = document.getElementById(id);
    this.input.addEventListener('change', onChange);
    this.valueAttrib = this.input.type === 'checkbox' ? 'checked' : 'value';
  }

  get value() {
    return this.input[this.valueAttrib];
  }
}

class OutputImage {
  constructor() {
    this.anchor = document.createElement('a');
    this.anchor.style.position='absolute';

    this.img = document.createElement('img');
    //this.img.style.filter = 'blur(4px)';

    this.anchor.appendChild(this.img);
  }

  setPreviewAndDownload(url) {
    this.img.src = url;

    this.anchor.href = url;
    this.anchor.download = 'marble.png';
    this.img.style.filter = '';
  }
}

function removeChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

const mimeType = {
  'jpg': 'image/jpeg',
  'png': 'image/png'
};

function getDataURL(imgData) {
  canvas.width = imgData.width;
  canvas.height = imgData.height;
  ctx.putImageData(imgData, 0, 0);
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(URL.createObjectURL(blob)), mimeType["png"], 0.92);
  });
}

const dom = {
  imageInput: document.getElementById('imageInput'),
  converted: document.getElementById('converted'),
  generating: document.getElementById('generating')
};

dom.imageInput.addEventListener('change', loadImage);

const settings = {
  interpolation: new RadioInput('interpolation', loadImage),
  mapping: new RadioInput('mapping', loadImage),
};

function loadImage() {
  const file = dom.imageInput.files[0];

  if (!file) {
    return;
  }

  const img = new Image();

  img.src = URL.createObjectURL(file);

  img.addEventListener('load', () => {
    const {width, height} = img;
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, width, height);

    processImage(data);
  });
}

let workers = [];

function processImage(data) {
  removeChildren(dom.converted);
  dom.generating.style.visibility = 'visible';

  for (let worker of workers) {
    worker.terminate();
  }

  const output = new OutputImage();
  dom.converted.appendChild(output.anchor);

  const options = {
    data: data,
    interpolation: settings.interpolation.value,
    mapping: settings.mapping.value,
  };

  const worker = new Worker('convert.js');

  const setPreviewAndDownload = ({data: imageData}) => {
    getDataURL(imageData)
      .then(url => output.setPreviewAndDownload(url));

    dom.generating.style.visibility = 'hidden';
    workers = [];
  };

  worker.onmessage = setPreviewAndDownload;
  worker.postMessage(options);

  workers.push(worker);
}
