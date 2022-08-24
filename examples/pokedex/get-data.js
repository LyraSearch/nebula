module.exports = async function getData() {
  return require('./dataset.json').pokemon.map(pokemon => ({
    num: pokemon.num,
    name: pokemon.name,
    img: pokemon.img,
    type: pokemon.type.join(', '),
    height: pokemon.height,
    weight: pokemon.weight,
    weaknesses: pokemon.weaknesses.join(', ')
  }))
}
