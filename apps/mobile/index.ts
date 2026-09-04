import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';

import { Aplicacao } from './src/Aplicacao';
import { ProvedorTema } from './src/aparencia/ProvedorTema';
import { createElement } from 'react';

function AplicacaoComTema() {
  return createElement(ProvedorTema, null, createElement(Aplicacao));
}

registerRootComponent(AplicacaoComTema);
