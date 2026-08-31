import { All, Controller, NotFoundException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller()
export class ControladorRotasDesconhecidas {
  @All('{*caminho}')
  public rejeitar(): never {
    throw new NotFoundException();
  }
}
